# PostKit — Multi-Schema Architecture

Design specification for multi-schema support in the PostKit `db` module.

---

## Overview

The current PostKit `db` module is designed around a single PostgreSQL schema (defaulting to `public`). This document describes the new architecture that supports multiple schemas in a single project, with:

- A clean per-schema directory structure under `db/schema/`
- Database-level infrastructure (`roles`, `extensions`, `CREATE SCHEMA`) lifted to a dedicated root `db/infra/` directory
- Schema plan ordering via the `schemas` array in config (array position = execution order)
- Full cross-schema dependency support through ordered plan application
- Manual migration escape hatch for complex cross-schema operations

---

## Guiding Principles

1. **Array order is execution order.** Schemas listed first are planned and applied first. Dependent schemas go later in the array.
2. **Infra is database-level, not schema-level.** Roles, extensions, and `CREATE SCHEMA` statements live at `db/infra/`, separate from schema SQL.
3. **Each schema owns its objects.** A trigger on `app.orders` lives in `db/schema/app/triggers/`, even if it calls a function from `public`.
4. **Cross-schema references are fully qualified.** Any SQL referencing objects outside its own schema uses the `schema.object` notation.
5. **One migration file per `apply`.** All per-schema plans are combined into a single dbmate migration, preserving the existing commit/deploy workflow unchanged.
6. **Backward compatible.** A project with `"schemas": ["public"]` behaves identically to the old single-schema mode. Existing projects only need a one-time file reorganization.

---

## Directory Structure

### Project Layout (new)

```
<project-root>/
├── db/
│   ├── infra/                        # DB-level infra (runs before everything)
│   │   ├── 001_roles.sql             # CREATE ROLE statements
│   │   ├── 002_extensions.sql        # CREATE EXTENSION statements
│   │   └── 003_schemas.sql           # CREATE SCHEMA statements
│   └── schema/                       # Per-schema SQL files
│       ├── public/                   # Schema: "public"
│       │   ├── tables/
│       │   │   └── users.sql
│       │   ├── views/
│       │   ├── functions/
│       │   │   └── audit_fn.sql
│       │   ├── triggers/
│       │   ├── types/
│       │   ├── enums/
│       │   ├── indexes/
│       │   ├── grants/
│       │   └── seeds/
│       └── app/                      # Schema: "app"
│           ├── tables/
│           │   └── orders.sql
│           ├── views/
│           ├── functions/
│           ├── triggers/
│           │   └── orders_audit.sql  # calls public.audit_fn() — cross-schema ref
│           ├── grants/
│           └── seeds/
├── postkit.config.json
└── postkit.secrets.json
```

### Why Infra Lives at `db/infra/`, Not Inside a Schema

| Object | Level | Reason |
|--------|-------|--------|
| `CREATE ROLE` | Database | Roles span the whole PostgreSQL cluster — no schema owns them |
| `CREATE EXTENSION` | Database | Extensions are installed per-database, not per-schema |
| `CREATE SCHEMA` | Database | The schema namespace itself is a DB-level object |
| `CREATE TABLE` | Schema | A table belongs to exactly one schema |
| `CREATE FUNCTION` | Schema | A function is schema-qualified |
| Seed data (`INSERT`) | Schema | Data belongs to schema-owned tables |

`db/infra/` is always applied first on every `apply` and `deploy`, before any schema DDL runs.

### `.postkit/` Runtime Directory (unchanged shape, extended content)

```
.postkit/
└── db/
    ├── session.json         # GITIGNORED — session state (extended for multi-schema)
    ├── schema_public.sql    # GITIGNORED — generated SQL for "public" schema
    ├── schema_app.sql       # GITIGNORED — generated SQL for "app" schema
    ├── plan_public.sql      # GITIGNORED — pgschema plan output for "public"
    ├── plan_app.sql         # GITIGNORED — pgschema plan output for "app"
    ├── session/             # GITIGNORED — session migration files
    │   └── 20250101120000_add_users.sql
    ├── committed.json       # COMMITTED — migration tracking index
    └── migrations/          # COMMITTED — committed migration files
        └── 20250101_add_users.sql
```

---

## Configuration

### `postkit.config.json` (committed to git)

```json
{
  "db": {
    "infraPath": "db/infra",
    "schemaPath": "db/schema",
    "schemas": ["public", "app"]
  }
}
```

**`infraPath`** — Path to the database-level infra directory (roles, extensions, CREATE SCHEMA). Relative to project root. Defaults to `"db/infra"` if not set.

**`schemaPath`** — Root directory containing per-schema subdirectories. Relative to project root. Defaults to `"db/schema"`.

**`schemas`** — Ordered array of schema names to manage. **Array position determines execution order.** Schema at index 0 is planned and applied first. Schemas that are dependencies of others must appear earlier in the array.

> **Backward compatibility:** Existing projects can set `"schemas": ["public"]` and keep all SQL directly under `db/schema/` without subdirectories. PostKit detects this flat layout automatically (see Migration Path section).

### `postkit.secrets.json` (gitignored — unchanged)

```json
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "remotes": {
      "dev": {
        "url": "postgres://user:pass@dev-host:5432/myapp",
        "default": true,
        "addedAt": "2024-01-01T00:00:00.000Z"
      },
      "staging": {
        "url": "postgres://user:pass@staging-host:5432/myapp"
      }
    }
  }
}
```

Secrets are unchanged. All remote configuration lives here, none in `postkit.config.json`.

### Resolved `DbConfig` (runtime, internal)

```typescript
interface DbConfig {
  infraPath: string;          // absolute path to db/infra/
  schemaPath: string;         // absolute path to db/schema/
  schemas: string[];          // e.g. ["public", "app"]
  localDbUrl: string;
  remotes: Record<string, RemoteConfig>;
  pgSchemaBin: string;
  dbmateBin: string;
  cliRoot: string;
  projectRoot: string;
}
```

---

## Execution Order Within a Schema

Within each schema directory the same section ordering applies as before:

```
infra (db/infra/) → [per schema]:
  extensions → types → enums → domains → sequences →
  functions → tables → views → materialized_views →
  triggers → indexes → constraints → policies → grants →
  seeds (db/schema/<name>/seeds/)
```

Files within each section directory are sorted alphabetically. Use numeric prefixes (`001_`, `002_`) to enforce explicit ordering when needed.

---

## How the Workflow Changes

### `postkit db plan`

**Before (single schema):**
```
generate schema.sql  →  pgschema plan --schema public  →  plan.sql
```

**After (multi-schema):**
```
For each schema in config.schemas (in order):
  1. generate schema_<name>.sql  from  db/schema/<name>/
  2. pgschema plan --schema <name> --file schema_<name>.sql  →  plan_<name>.sql
  3. apply plan_<name>.sql to local DB  ← intermediate apply (not a real migration)
     (makes schema <name>'s objects live so later schemas can reference them)

Combine all non-empty plan_*.sql files into the final combined plan (in array order)
Display combined plan to user
```

**Why the intermediate apply in step 3?**

When planning `app`, pgschema connects to the local DB and validates the SQL. If `app/triggers/orders_audit.sql` references `public.audit_fn()`, that function must already exist in the local DB at plan time or pgschema will error. Applying `plan_public.sql` to the local DB before planning `app` ensures all cross-schema references resolve correctly.

This intermediate apply is not a real migration — it is applied directly to the local DB that was cloned at `db start`. It will be rolled up into the final migration file at `db apply`.

**Session state (extended):**

```json
{
  "pendingChanges": {
    "planned": true,
    "planFiles": {
      "public": ".postkit/db/plan_public.sql",
      "app": ".postkit/db/plan_app.sql"
    },
    "schemaFingerprints": {
      "public": "abc123...",
      "app": "def456..."
    }
  }
}
```

`planFile` (singular) is replaced by `planFiles` (map of schema name → plan file path) and `schemaFingerprint` (singular) is replaced by `schemaFingerprints` (map of schema name → fingerprint).

---

### `postkit db apply`

**Before:**
```
wrapPlanSQL(plan.sql)  →  one migration file  →  dbmate migrate
```

**After:**
```
For each schema in config.schemas (in order):
  if plan_<name>.sql has changes:
    wrapPlanSQL(plan_<name>.sql, schemaName)
    append to combined migration SQL

Write combined SQL as one dbmate migration file
Run dbmate migrate on local DB
Apply db/schema/<name>/seeds/ for each schema (in order)
```

**`wrapPlanSQL` with schema name:**

```sql
-- plan_public.sql wrapped:
SET search_path TO "public";

CREATE TABLE users (...);
CREATE FUNCTION audit_fn() ...;

-- plan_app.sql wrapped (appended in same file):
SET search_path TO "app";

CREATE TABLE orders (...);
CREATE TRIGGER orders_audit ...;
```

A single migration file covers all schemas. The `SET search_path` statements ensure each DDL block is applied to the correct schema. dbmate applies this as one atomic transaction.

**Fingerprint validation:**

Before applying, PostKit re-hashes each schema's source files and compares against the stored `schemaFingerprints`. If any schema's files changed since `plan`, the apply is rejected and the user must re-run `plan`.

---

### `postkit db commit` (unchanged)

Commit merges all session migration files into one committed migration in `.postkit/db/migrations/`. This step is completely unaware of schemas — it operates on SQL files only. No changes required.

---

### `postkit db deploy` (unchanged)

Deploy reads committed migration files and applies them to the target DB via dbmate. Since multi-schema plan output is already combined into one migration file at apply time, deploy is completely unaware of schemas. No changes required.

The deploy dry-run and apply sequence (infra → dbmate migrate → seeds) now means:
- Infra reads from `db/infra/` (not `db/schema/infra/`)
- Seeds reads from `db/schema/<name>/seeds/` for each schema in order

---

### `postkit db import` (extended)

**Before:**
```
postkit db import --schema public
→ dumps public, normalizes into db/schema/, creates baseline migration
```

**After:**
```
postkit db import --schemas public,app
→ for each schema in order:
    dump schema  →  normalize into db/schema/<name>/
  query DB for roles, extensions, CREATE SCHEMA  →  write to db/infra/
  generate combined baseline DDL via pgschema plan (ordered)
  create one baseline migration covering all schemas
```

**New flag:** `--schemas` accepts a comma-separated list: `--schemas public,app`. The order determines plan ordering for baseline generation.

If `--schemas` is omitted, PostKit reads the `schemas` array from config and imports all of them.

---

### `postkit db infra` (path change only)

Now reads from `db/infra/` instead of `db/schema/infra/`. Command interface unchanged.

---

### `postkit db seed` (extended)

Now iterates over all schemas in config order, applying `db/schema/<name>/seeds/` for each:

```bash
postkit db seed                           # show all seeds across all schemas
postkit db seed --apply                   # apply seeds for all schemas to local
postkit db seed --apply --schema app      # apply seeds for one schema only
postkit db seed --apply --target=remote   # apply all seeds to remote
```

---

## Cross-Schema Dependencies

### The Rule: Owner Schema Holds the SQL, Referenced Schema Comes First in Array

A trigger on `app.orders` that calls `public.audit_fn()`:

- The trigger SQL file lives in `db/schema/app/triggers/orders_audit.sql`
- `public` must appear before `app` in the `schemas` array
- The function reference is fully qualified: `EXECUTE FUNCTION public.audit_fn()`

```json
{
  "db": {
    "schemas": ["public", "app"]
  }
}
```

```sql
-- db/schema/app/triggers/orders_audit.sql
CREATE TRIGGER orders_audit
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_fn();
--                               ^^ fully qualified
```

PostKit plans `public` first, applies it to the local DB, then plans `app`. By the time pgschema validates `app`'s trigger, `public.audit_fn()` already exists in the local DB.

### Cross-Schema Reference Patterns

| Scenario | Where SQL lives | Fully qualified reference |
|----------|----------------|--------------------------|
| Trigger on `app` table calling `public` function | `db/schema/app/triggers/` | `EXECUTE FUNCTION public.fn()` |
| FK from `app` table to `public` table | `db/schema/app/tables/` | `REFERENCES public.users(id)` |
| `app` view querying `public` table | `db/schema/app/views/` | `FROM public.products` |
| Shared utility function used by both | `db/schema/public/functions/` | Always call as `public.fn()` |
| Grant on `public` object to role used by `app` | `db/schema/public/grants/` | Standard grant syntax |

### When pgschema Cannot Handle It: Manual Migrations

Use `postkit db migration` for operations that span schemas structurally — e.g., atomically renaming a function in `public` and updating all callers in `app` simultaneously:

```bash
postkit db migration cross_schema_refactor
```

This creates a blank SQL file in `.postkit/db/session/` that you write manually. It bypasses pgschema entirely and is applied directly via dbmate. Use for:

- Atomic cross-schema restructuring
- Data migrations that touch tables across schemas
- Operations pgschema cannot model (e.g., `ALTER TYPE ... ADD VALUE`, `CREATE DOMAIN` with cross-schema references)
- Anything where you need full control over the SQL

---

## Session State (updated shape)

```json
{
  "active": true,
  "startedAt": "2026-05-11T10:00:00Z",
  "clonedAt": "20260511100000",
  "remoteName": "dev",
  "localDbUrl": "postgres://postgres:postkit@localhost:15432/postkit_local",
  "remoteDbUrl": "postgres://...",
  "containerID": "abc123",
  "pendingChanges": {
    "planned": true,
    "applied": false,
    "planFiles": {
      "public": ".postkit/db/plan_public.sql",
      "app": ".postkit/db/plan_app.sql"
    },
    "schemaFingerprints": {
      "public": "a1b2c3...",
      "app": "d4e5f6..."
    },
    "migrationFiles": [],
    "description": null,
    "migrationApplied": false,
    "seedsApplied": false
  }
}
```

**Changed fields:**

| Old field | New field | Notes |
|-----------|-----------|-------|
| `planFile: string \| null` | `planFiles: Record<string, string \| null>` | One plan file per schema |
| `schemaFingerprint: string \| null` | `schemaFingerprints: Record<string, string \| null>` | One fingerprint per schema |

All other fields are unchanged.

---

## Internal Code Changes Required

### `common/config.ts` + `modules/db/types/config.ts`

```typescript
// Old
interface DbPublicConfig {
  schema?: string;
  schemaPath?: string;
}

// New
interface DbPublicConfig {
  schemas?: string[];          // ordered schema names
  schemaPath?: string;         // root of per-schema dirs
  infraPath?: string;          // db/infra/ location
}

// DbConfig (runtime)
interface DbConfig {
  schemas: string[];           // resolved, defaulting to ["public"]
  schemaPath: string;          // absolute path
  infraPath: string;           // absolute path
  // ... rest unchanged
}
```

### `modules/db/utils/db-config.ts`

New path helpers:

```typescript
export function getInfraPath(): string          // projectRoot/db/infra
export function getSchemaPathForSchema(name: string): string  // projectRoot/db/schema/<name>
export function getPlanFilePath(schemaName: string): string   // .postkit/db/plan_<name>.sql
export function getGeneratedSchemaPath(schemaName: string): string // .postkit/db/schema_<name>.sql
```

Old `getPlanFilePath()` and `getGeneratedSchemaPath()` become wrappers calling the new versions.

### `modules/db/services/schema-generator.ts`

`generateSchemaSQLAndFingerprint()` gains a `schemaName` parameter:

```typescript
// Old: reads entire config.schemaPath
generateSchemaSQLAndFingerprint(): Promise<{schemaFile, fingerprint}>

// New: reads config.schemaPath/<schemaName>/
generateSchemaSQLAndFingerprint(schemaName: string): Promise<{schemaFile, fingerprint}>
```

Called in a loop over `config.schemas` from the plan command.

### `modules/db/services/pgschema.ts`

`runPgschemaplan()` and `runPgschemaDiff()` already accept `schemaOverride`. The plan command now calls them in schema order.

`wrapPlanSQL()` signature change:

```typescript
// Old
wrapPlanSQL(planFile: string): Promise<string>

// New
wrapPlanSQL(planFile: string, schemaName: string): Promise<string>
// prepends: SET search_path TO "<schemaName>";
```

### `modules/db/services/infra-generator.ts`

`loadInfra()` changes its source path from:

```typescript
// Old
path.join(config.schemaPath, "infra")

// New
config.infraPath   // e.g. projectRoot/db/infra
```

No other changes to the infra service or command.

### `modules/db/services/seed-generator.ts`

`loadSeeds()` iterates over all schemas:

```typescript
// Old: one path
path.join(config.schemaPath, "seeds")

// New: one path per schema
for (const schema of config.schemas) {
  path.join(config.schemaPath, schema, "seeds")
}
```

Seeds are applied in schema array order.

### `modules/db/commands/plan.ts`

Core loop change — plans each schema in order with intermediate apply:

```
for each schemaName in config.schemas:
  1. generateSchemaSQLAndFingerprint(schemaName) → schemaFile, fingerprint
  2. runPgschemaplan(schemaFile, session.localDbUrl, schemaName) → planResult
  3. if planResult.hasChanges:
       apply plan to local DB immediately (intermediate apply)
       store planFiles[schemaName], schemaFingerprints[schemaName]

update session with planFiles map and schemaFingerprints map
display combined plan (all schema outputs)
```

### `modules/db/commands/apply.ts`

Combines per-schema wrapped plans into one migration:

```
validate each schemaFingerprints[name] matches current file hash

combinedSQL = ""
for each schemaName in config.schemas:
  if planFiles[schemaName] exists:
    combinedSQL += wrapPlanSQL(planFiles[schemaName], schemaName)

create one migration file with combinedSQL
run dbmate migrate

for each schemaName in config.schemas:
  applySeedsStep(session.localDbUrl, schemaName)
```

### `modules/db/services/schema-importer.ts`

`normalizeDumpForPostkit()` gains `schemaName` and writes to:

```typescript
path.join(config.schemaPath, schemaName, dirName)
// e.g. db/schema/app/tables/
```

Infra output (roles, extensions, CREATE SCHEMA) writes to:

```typescript
config.infraPath
// e.g. db/infra/001_roles.sql
```

`generateBaselineDDL()` loops over schemas in order, same intermediate-apply pattern as `plan`.

---

## Backward Compatibility and Migration Path

### Detecting Flat Layout (single-schema projects)

If `config.schemas` is `["public"]` (or not set, defaulting to `["public"]`) AND there is no `db/schema/public/` subdirectory but there IS a `db/schema/tables/` directory at the root, PostKit treats the flat layout as equivalent to a single `"public"` schema at `db/schema/` directly.

This means **existing projects work without any file changes** as long as they have one schema. They only need to add `"schemas": ["public"]` to their config (or leave it unset).

### Migrating an Existing Project to Multi-Schema

1. Add the new config:

```json
{
  "db": {
    "infraPath": "db/infra",
    "schemaPath": "db/schema",
    "schemas": ["public", "app"]
  }
}
```

2. Reorganize the `db/` directory:

```bash
# Move infra out of schema dir to root db/infra/
mv db/schema/infra/  db/infra/

# Create per-schema subdirectories
mkdir -p db/schema/public
mkdir -p db/schema/app

# Move existing schema files into public/
mv db/schema/tables/    db/schema/public/tables/
mv db/schema/views/     db/schema/public/views/
mv db/schema/functions/ db/schema/public/functions/
mv db/schema/triggers/  db/schema/public/triggers/
mv db/schema/types/     db/schema/public/types/
mv db/schema/enums/     db/schema/public/enums/
mv db/schema/grants/    db/schema/public/grants/
mv db/schema/seeds/     db/schema/public/seeds/

# Create app schema dirs
mkdir -p db/schema/app/tables
mkdir -p db/schema/app/views
mkdir -p db/schema/app/seeds
```

3. Update `.pgschemaignore`:
   - Move or copy it into each schema dir: `db/schema/public/.pgschemaignore`, `db/schema/app/.pgschemaignore`

4. Update `.gitignore` (from `postkit init`):
   - Old: `.postkit/db/plan.sql`, `.postkit/db/schema.sql`
   - New: `.postkit/db/plan_*.sql`, `.postkit/db/schema_*.sql`

---

## Complete Workflow Example

### Setup

```bash
# postkit.config.json
{
  "db": {
    "infraPath": "db/infra",
    "schemaPath": "db/schema",
    "schemas": ["public", "app"]
  }
}

# postkit.secrets.json
{
  "db": {
    "localDbUrl": "postgres://postgres:pass@localhost:5432/myapp_local",
    "remotes": {
      "dev": { "url": "postgres://...", "default": true }
    }
  }
}
```

### Directory state before starting work

```
db/
├── infra/
│   ├── 001_roles.sql          (CREATE ROLE app_user ...)
│   ├── 002_extensions.sql     (CREATE EXTENSION pgcrypto ...)
│   └── 003_schemas.sql        (CREATE SCHEMA IF NOT EXISTS app ...)
└── schema/
    ├── public/
    │   ├── tables/users.sql
    │   └── functions/audit_fn.sql
    └── app/
        ├── tables/orders.sql
        └── triggers/orders_audit.sql  ← calls public.audit_fn()
```

### Step-by-step

```bash
# 1. Start session
postkit db start
# → tests remote connection (dev)
# → starts postgres:16-alpine container (if localDbUrl empty)
# → clones remote DB to local
# → creates .postkit/db/session.json

# 2. Edit schema files
#    e.g. add "status" column to db/schema/app/tables/orders.sql

# 3. Generate plan
postkit db plan
# → generates db/schema/public/ → .postkit/db/schema_public.sql
# → pgschema plan --schema public  → .postkit/db/plan_public.sql  (no changes)
# → applies plan_public.sql to local DB  (intermediate — makes public.audit_fn live)
# → generates db/schema/app/ → .postkit/db/schema_app.sql
# → pgschema plan --schema app  → .postkit/db/plan_app.sql  (ALTER TABLE orders ADD COLUMN status)
# → applies plan_app.sql to local DB  (intermediate)
# → displays combined plan, saves planFiles + fingerprints to session.json

# Output:
# Schema: public — No changes
# Schema: app —
#   ALTER TABLE orders ADD COLUMN status TEXT;

# 4. Apply migration
postkit db apply
# → validates fingerprints (checks db/schema/* files unchanged since plan)
# → combines wrapped plans:
#     SET search_path TO "app";
#     ALTER TABLE orders ADD COLUMN status TEXT;
# → creates .postkit/db/session/20260511100000_add_order_status.sql
# → runs dbmate migrate on local DB
# → applies db/schema/public/seeds/ (none)
# → applies db/schema/app/seeds/ (none)
# → updates session: applied=true

# 5. Commit
postkit db commit -m "add order status column"
# → merges session migrations → .postkit/db/migrations/20260511_add_order_status.sql
# → updates .postkit/db/committed.json
# → cleans session files

# 6. Deploy
postkit db deploy --remote dev
# → checks pending migrations in dev DB's postkit.schema_migrations
# → clones dev DB to local (dry-run)
# → applies db/infra/ to local clone
# → runs dbmate migrate (applies 20260511_add_order_status.sql) on local clone
# → applies seeds on local clone
# → dry-run passed → confirms → applies same steps on dev remote
# → drops local clone, stops temp container (if used)
```

### Manual Cross-Schema Migration

When you need to add a new function to `public` AND immediately add a trigger in `app` that uses it, in the same atomic operation:

```bash
# Instead of plan → apply (two schema plans), do:
postkit db migration add_audit_with_trigger

# Edit .postkit/db/session/20260511_add_audit_with_trigger.sql:
```

```sql
-- Step 1: create function in public
CREATE OR REPLACE FUNCTION public.new_audit_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_log(table_name, action, changed_at)
  VALUES (TG_TABLE_NAME, TG_OP, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: add trigger in app that calls it
CREATE TRIGGER orders_new_audit
  AFTER INSERT OR UPDATE ON app.orders
  FOR EACH ROW EXECUTE FUNCTION public.new_audit_fn();
```

```bash
postkit db apply   # applies the manual migration directly via dbmate
postkit db commit -m "add new audit function and trigger"
postkit db deploy
```

This bypasses pgschema entirely. The SQL you write is exactly what gets applied.

---

## Summary of What Changes vs. What Stays the Same

### Changes

| Area | What changes |
|------|-------------|
| `postkit.config.json` | `schema: string` → `schemas: string[]` + new `infraPath` key |
| `db/` directory layout | `db/schema/infra/` → `db/infra/`, per-schema subdirs under `db/schema/` |
| `db-config.ts` | New path helpers for infra, per-schema paths, per-schema plan files |
| `types/config.ts` | `DbPublicConfig`, `DbConfig` updated |
| `types/session.ts` | `planFile` → `planFiles`, `schemaFingerprint` → `schemaFingerprints` |
| `schema-generator.ts` | Accepts `schemaName`, reads from `db/schema/<name>/` |
| `pgschema.ts` | `wrapPlanSQL` gains `schemaName` param |
| `infra-generator.ts` | Reads from `config.infraPath` instead of `config.schemaPath/infra` |
| `seed-generator.ts` | Iterates over all schemas, reads `db/schema/<name>/seeds/` |
| `commands/plan.ts` | Loops over schemas in order, intermediate apply between schemas |
| `commands/apply.ts` | Combines per-schema wrapped plans into one migration file |
| `commands/import.ts` | `--schemas` flag, loops dump/normalize per schema, infra to `db/infra/` |
| `schema-importer.ts` | Per-schema output dirs, infra writes to `db/infra/` |
| `.gitignore` (init) | `plan.sql` → `plan_*.sql`, `schema.sql` → `schema_*.sql` |

### Stays the Same

| Area | Why unchanged |
|------|--------------|
| `postkit db commit` | Operates on SQL files only — schema-unaware |
| `postkit db deploy` | Runs committed SQL files via dbmate — schema-unaware |
| `postkit db start` | Clones DB, creates session — schema-unaware |
| `postkit db abort` | Cleanup only — schema-unaware |
| `postkit db status` | Reads session.json — needs minor display update only |
| `postkit db remote *` | Remote management — completely separate from schemas |
| `postkit db migration` | Manual migration creation — schema-unaware |
| Secrets format | `postkit.secrets.json` is unchanged |
| Remote management | All remote logic in `remotes.ts` is unchanged |
| dbmate migration format | Single SQL file per commit — unchanged |
| Session lifecycle | start → plan → apply → commit → deploy — unchanged |
| `committed.json` format | Unchanged |
| Dry-run in deploy | Unchanged — runs the committed SQL file |
| Auto Docker container | Unchanged — version-matched container logic |
