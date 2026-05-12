# 📦 Database Migration Module (`postkit db`)

A session-based database migration workflow for safe schema changes. Clone your remote database locally, develop and test changes, then commit back to production.

---

## 🔄 Migration Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMLINED MIGRATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   $ postkit db start                 $ postkit db plan                       │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 1. Clone remote  │            │ 3. Generate      │                       │
│   │    to local DB   │            │    schema.sql    │                       │
│   │ 2. Start session │            │ 4. Run pgschema  │                       │
│   │    (track state) │            │    plan (diff)   │                       │
│   └────────┬─────────┘            │ 5. Save schema   │                       │
│            │                      │    fingerprint   │                       │
│            ▼                      └────────┬─────────┘                       │
│   ┌──────────────────┐                     │                                 │
│   │ User modifies    │                     ▼                                 │
│   │ schema files     │            ┌──────────────────┐                       │
│   │ (db/schema/*)    │            │ Shows changes    │                       │
│   └──────────────────┘            │ to apply         │                       │
│                                   └──────────────────┘                       │
│   $ postkit db apply                       │                                 │
│   ┌──────────────────┐                     ▼                                 │
│   │ 6. Validate      │            ┌──────────────────┐                       │
│   │    fingerprint   │            │ 7. Apply infra   │                       │
│   │ 7. Apply infra   │            │ 8. Create dbmate │                       │
│   │ 8. Create dbmate │            │    migration     │                       │
│   │    migration     │            │ 9. Run dbmate    │                       │
│   │ 9. Run dbmate    │            │    on local DB   │                       │
│   │    on local DB   │            │ 10. Apply seeds  │                       │
│   │ 10. Apply seeds  │            └────────┬─────────┘                       │
│   └────────┬─────────┘                     │                                 │
│            │                               ▼                                 │
│   $ postkit db commit                                                        │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 11. Copy staging │            │ 12. Copy session │                       │
│   │     migrations   │            │     migrations   │                       │
│   │ 12. Update state │            │     to .postkit  │                       │
│   │ 13. Track for    │            │     /db/migrations│                      │
│   │     deploy       │            │ 14. Update state │                       │
│   └──────────────────┘            └──────────────────┘                       │
│                                                                              │
│   $ postkit db deploy                                                        │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 14. Dry run on   │            │ 15. Deploy to    │                       │
│   │     local clone  │───────────►│     remote DB    │                       │
│   │                  │            │ 16. Mark as      │                       │
│   │                  │            │     deployed     │                       │
│   └──────────────────┘            └──────────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧰 Prerequisites

- **pgschema** — Bundled with PostKit. Platform-specific binaries are shipped in `vendor/pgschema/` and resolved automatically. No separate installation needed.
- **dbmate** — Installed automatically as an npm dependency. No separate installation needed.
- **Docker** _(optional)_ — Required only if `db.localDbUrl` is empty. PostKit will automatically spin up a version-matched `postgres:{version}-alpine` container for the session and tear it down when done.

---

## ⚙️ Configuration

### Split Configuration Files

PostKit uses two configuration files to separate non-sensitive settings from credentials:

| File | Committed to Git | Purpose |
|------|-----------------|---------|
| `postkit.config.json` | **Yes** | Schema paths, non-sensitive project settings (no remotes) |
| `postkit.secrets.json` | **No** (gitignored) | Database URLs, passwords, credentials |

Both files are deep-merged at load time. Use `postkit.secrets.example.json` (auto-generated by `postkit init`) as a template for team members to create their own `postkit.secrets.json`.

### `postkit.config.json` (committed)

Contains only non-sensitive project settings. Remotes are user/environment-specific and live entirely in secrets.

```json
{
  "db": {
    "infraPath": "db/infra",
    "schemaPath": "db/schema",
    "schemas": ["public"]
  }
}
```

### `postkit.secrets.json` (gitignored)

Contains all credentials and remote configurations.

```json
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "remotes": {
      "dev": {
        "url": "postgres://user:pass@dev-host:5432/myapp",
        "default": true,
        "addedAt": "2024-12-31T10:00:00.000Z"
      },
      "staging": {
        "url": "postgres://user:pass@staging-host:5432/myapp"
      }
    }
  }
}
```

> **Tip:** Leave `localDbUrl` empty (or omit it) to have PostKit automatically start a Docker container for your local database. The container image version is matched to your remote PostgreSQL version automatically.

### Config Properties

| Property | File | Description | Required |
|----------|------|-------------|----------|
| `db.localDbUrl` | secrets | PostgreSQL URL for local clone database. Leave empty to use auto Docker container. | No |
| `db.schemaPath` | config | Root path for per-schema subdirectories (relative to project root). Default: `"db/schema"` | No |
| `db.schemas` | config | Ordered array of schema names to manage. Array position = execution order. Default: `["public"]` | No |
| `db.infraPath` | config | Path to DB-level infra directory (roles, extensions, CREATE SCHEMA). Default: `"db/infra"` | No |
| `db.pgSchemaBin` | config | Path to pgschema binary | No |
| `db.dbmateBin` | config | Path to dbmate binary | No |
| `db.remotes` | secrets | Named remote database configurations | Yes (at least one) |

### Remote Configuration

All remote data lives entirely in `postkit.secrets.json` — nothing remote-related is written to `postkit.config.json`. Remotes are user/environment-specific and should not be committed.

```json
// postkit.secrets.json
{
  "db": {
    "remotes": {
      "dev": { "url": "postgres://user:pass@dev-host:5432/myapp", "default": true, "addedAt": "2024-12-31T10:00:00.000Z" },
      "staging": { "url": "postgres://user:pass@staging-host:5432/myapp" },
      "production": { "url": "postgres://user:pass@prod-host:5432/myapp" }
    }
  }
}
```

**Remote properties (all in `postkit.secrets.json`):**
- `url` - PostgreSQL connection URL (required)
- `default` - Mark as default remote (optional, one must be default)
- `addedAt` - ISO timestamp when remote was added (auto-set)

### Binary Resolution

Both `pgschema` and `dbmate` binaries are resolved automatically using the following priority:

**pgschema:**

1. Custom path set in `postkit.config.json` (`db.pgSchemaBin`) — if explicitly set to something other than `"pgschema"`
2. Bundled binary in `vendor/pgschema/pgschema-{platform}-{arch}[.exe]`
3. System PATH fallback (`pgschema`)

Bundled binaries are included for: `darwin-arm64`, `darwin-amd64`, `linux-arm64`, `linux-amd64`, `windows-amd64`, `windows-arm64`.

**dbmate:**

1. Custom path set in `postkit.config.json` (`db.dbmateBin`) — if explicitly set to something other than `"dbmate"`
2. npm-installed binary (via the `dbmate` npm package, installed automatically with PostKit)
3. System PATH fallback (`dbmate`)

### Schema Directory Structure

The tool expects schema files in per-schema subdirectories under `db/schema/`, with DB-level infra at `db/infra/`:

```
db/
├── infra/                    # DB-level infrastructure (roles, extensions, CREATE SCHEMA)
│   ├── 001_roles.sql
│   ├── 002_schemas.sql
│   └── 003_extensions.sql
└── schema/                   # Per-schema SQL files
    ├── public/               # Schema: "public"
    │   ├── types/
    │   ├── enums/
    │   ├── tables/
    │   │   ├── users.sql
    │   │   └── posts.sql
    │   ├── views/
    │   ├── functions/
    │   ├── triggers/
    │   ├── policies/
    │   ├── grants/           # Grant statements (managed by pgschema)
    │   └── seeds/            # Post-migration seed data
    └── app/                  # Schema: "app" (optional)
        ├── tables/
        └── seeds/
```

**Execution ordering:** `db/infra/` (pre-migration, DB-level) → for each schema in `config.schemas` order: extensions → types → enums → domains → sequences → functions → tables → views → materialized_views → triggers → indexes → constraints → policies → grants → `seeds/` (post-migration per schema)

**Note:** `db/infra/` and `seeds/` are excluded from pgschema processing and applied as separate steps. `grants/` is managed by pgschema. Use `postkit db schema add <name>` to scaffold a new schema directory.

### PostKit Directory Structure

PostKit files in `.postkit/db/` are split between gitignored (ephemeral) and committed (shared with team):

```
.postkit/
└── db/
    ├── session.json         # GITIGNORED — current session state
    ├── plan.sql             # GITIGNORED — generated migration plan
    ├── schema.sql           # GITIGNORED — generated schema from files
    ├── session/             # GITIGNORED — session migrations (temporary)
    │   └── 20250131_*.sql
    ├── committed.json       # COMMITTED — migrations tracking index (shared)
    └── migrations/          # COMMITTED — committed migrations (for deploy)
        ├── 20250130_add_users.sql
        └── 20250131_add_posts.sql
```

`postkit init` adds only the ephemeral paths to `.gitignore` (`.postkit/db/session.json`, `.postkit/db/plan.sql`, `.postkit/db/schema.sql`, `.postkit/db/session/`). The `migrations/` directory and `committed.json` are committed to git and shared across the team.

---

## 🚀 Commands

### `postkit db start [--remote <name>]`

Clone a remote database to local and initialize a migration session. Existing schema files are preserved.

```bash
postkit db start                    # Uses default remote
postkit db start --remote staging   # Use specific remote
```

**What it does:**
1. Checks prerequisites (pgschema, dbmate installed)
2. Resolves target remote (default or specified)
3. Tests connection to remote database and detects its PostgreSQL major version
4. Checks for pending committed migrations by querying the remote's `postkit.schema_migrations` table
5. **If `localDbUrl` is empty**: Checks Docker availability and starts a `postgres:{version}-alpine` container on a free port (15432–15532), where `{version}` matches the remote database's PostgreSQL major version
6. Clones remote database to local. When using an auto-container, `pg_dump` and `psql` run inside the container via `docker exec` (version-matched tools, no host binary required)
7. Creates a session file (`.postkit/db/session.json`) to track state, including the container ID if a container was started

**Auto-container:** When `localDbUrl` is not configured, PostKit manages the full container lifecycle — start on `db start`, stop on `db abort`. The container image always matches the remote PostgreSQL version.

---

### `postkit db plan`

Generate a schema diff showing what changes will be applied.

```bash
postkit db plan
```

**What it does:**
1. Combines all schema files from `db/schema/` into a single SQL file (excluding `infra/`, `seeds/`)
2. Runs `pgschema plan` to compare against local database
3. Saves a schema fingerprint (SHA-256 hash of source files) for validation during apply
4. Displays the migration plan and saves to `.postkit/db/plan.sql`

---

### `postkit db apply`

Apply the planned schema changes to the local cloned database. Creates a dbmate migration file and runs it locally.

```bash
postkit db apply
postkit db apply -f          # Skip confirmation
```

**What it does:**
1. Validates schema fingerprint (ensures schema files haven't changed since plan)
2. Displays the planned changes
3. Tests local database connection
4. Applies infrastructure SQL from `db/schema/infra/`
5. Wraps the plan SQL and creates a dbmate migration file (staged in `.postkit/db/session/`)
6. Runs `dbmate migrate` on the local database
7. Applies seed data from `db/schema/seeds/`

**Resume support:** If seeds fail, re-running `postkit db apply` resumes from where it left off (the migration is not re-applied).

---

### `postkit db commit`

Commit session migrations for deployment. Creates a single committed migration from all session migrations.

```bash
postkit db commit
postkit db commit -f         # Skip confirmation
```

**What it does:**
1. Prompts for a migration description
2. Merges all session migrations from `.postkit/db/session/` into a single migration file
3. Writes the committed migration to `.postkit/db/migrations/`
4. Updates `.postkit/db/committed.json` to track the committed migration
5. Cleans up session files

---

### `postkit db deploy [--remote <name>] [--url <url>]`

Deploy committed migrations to a remote database. Performs a full dry-run verification on a local clone before touching the target.

```bash
postkit db deploy                        # Uses default remote
postkit db deploy --remote staging       # Use specific remote
postkit db deploy --url=postgres://...   # Direct URL override
postkit db deploy --remote production -f # Skip confirmations
postkit db deploy --dry-run              # Verify only, don't touch target
```

**What it does:**
1. Resolves the target database URL (from remote config or `--url` flag)
2. Checks for pending committed migrations by querying the remote's `postkit.schema_migrations` table
3. If an active session exists, removes it (with confirmation unless `-f`)
4. Tests the target database connection and detects its PostgreSQL major version
5. **If `localDbUrl` is empty**: Starts a temporary `postgres:{version}-alpine` container (version-matched to the target) for the dry-run
6. Clones the target database to the local URL. When using a temp container, cloning runs via `docker exec` inside the container
7. Runs a full dry-run on the local clone: infra, dbmate migrate, seeds
8. If `--dry-run` is set, stops here and reports results without touching the target
9. Reports dry-run results and confirms deployment (unless `-f`)
10. Applies to target: infra, dbmate migrate, seeds
11. Drops the local clone database; stops and removes the temp container if one was used

If the dry run fails, deployment is aborted and no changes are made to the target database.

---

### `postkit db remote`

Manage named remote databases.

```bash
# List all remotes
postkit db remote list
postkit db remote list --json   # Machine-readable JSON output

# Add a new remote
postkit db remote add staging "postgres://user:pass@host:5432/db"
postkit db remote add production "postgres://user:pass@host:5432/db" --default

# Remove a remote
postkit db remote remove staging
postkit db remote remove staging --force  # Skip confirmation

# Set default remote
postkit db remote use production
```

---

### `postkit db migration [<name>]`

Create a manual SQL migration file in the session directory.

```bash
postkit db migration
postkit db migration add_users_table
```

---

### `postkit db status`

Show the current session state and pending changes.

```bash
postkit db status
postkit db status --json   # Machine-readable JSON output
```

---

### `postkit db abort`

Cancel the current session and clean up all local resources.

```bash
postkit db abort
postkit db abort -f          # Skip confirmation
```

---

### `postkit db import [--url <url>] [--schemas <list>] [--name <name>]`

Import an existing database into PostKit as a baseline migration. Use when onboarding a database not previously managed by PostKit.

```bash
postkit db import                                           # Import all schemas from config
postkit db import --url "postgres://user:pass@host/myapp"  # Import from specific URL
postkit db import --schemas "public,app" --name initial_baseline
```

**What it does:**
1. Checks prerequisites (pgschema, dbmate, no active session)
2. Connects to target database, reports table count
3. Warns about existing schema/migration files (both directories will be **cleared and replaced**), prompts confirmation
4. Runs `pgschema dump --multi-file` per schema into a temp directory
5. Clears existing schema directory, then normalizes dump into PostKit structure:
   - Object files copied into `db/schema/<name>/<section>/` with numeric prefix ordering
   - Roles queried from `pg_roles` → `db/infra/001_roles.sql` (idempotent `DO $$ IF NOT EXISTS $$`)
   - Schemas queried from `pg_namespace` → `db/infra/002_schemas.sql` (`CREATE SCHEMA IF NOT EXISTS`)
   - Extensions parsed from `schema.sql` → `extensions/imported_extensions.sql`
   - Privileges consolidated into `grants/<schema>.sql` (managed by pgschema)
   - **Updates `postkit.config.json`** — adds all imported schema names to `db.schemas` array (idempotent)
6. Clears existing migrations directory and generates baseline DDL via `pgschema plan` (all schemas in order, with intermediate apply between schemas)
7. Creates local database, applies `db/infra/` SQL, then applies baseline migration via `dbmate`
8. After successful local apply, inserts baseline version into `postkit.schema_migrations` on the source database
9. Updates `committed.json` to track the baseline migration
10. Cleans up temp directory, plan file, and generated schema files

**Why roles/schemas are queried from DB directly:**
`pgschema dump` does not emit `CREATE SCHEMA` or `CREATE ROLE` statements. PostKit queries `pg_catalog.pg_namespace` and `pg_catalog.pg_roles` instead to reliably capture infra.

**Why infra SQL is applied before dbmate:**
The baseline migration may contain `ALTER DEFAULT PRIVILEGES` and other statements that reference roles. These roles must exist in the local database before dbmate runs the migration. `db/infra/` is applied first to create those roles.

---

### `postkit db infra [--apply] [--target <local|remote>]`

Manage infrastructure SQL (roles, schemas, extensions) from `db/infra/`.

```bash
postkit db infra                          # Show infra statements
postkit db infra --apply                  # Apply to local
postkit db infra --apply --target=remote  # Apply to remote
```

---

### `postkit db seed [--apply] [--target <local|remote>]`

Manage seed data from `db/schema/seeds/`.

```bash
postkit db seed                           # Show seed statements
postkit db seed --apply                   # Apply to local
postkit db seed --apply --target=remote   # Apply to remote
```

---

## 📋 Typical Workflow

```bash
# 1. Add remotes (first time setup)
postkit db remote add dev "postgres://user:pass@dev-host:5432/myapp" --default
postkit db remote add staging "postgres://user:pass@staging-host:5432/myapp"

# 2. Start a session (clones remote DB locally)
postkit db start                    # Uses default remote
postkit db start --remote staging   # Or specify remote

# 3. Edit schema files in db/schema/
#    e.g., add a column to db/schema/tables/users.sql

# 4. Preview changes
postkit db plan

# 5. Test on local clone (asks for migration description, creates migration file)
postkit db apply

# 6. (Optional) Make more changes and repeat plan → apply

# 7. Commit when ready
postkit db commit

# 8. Deploy to remote
postkit db deploy --remote staging

# If something goes wrong:
postkit db abort
```

---

## 🔧 Session State

Session state is stored in `.postkit/db/session.json`:

```json
{
  "active": true,
  "startedAt": "2026-02-11T12:00:00Z",
  "clonedAt": "20260211120000",
  "remoteName": "staging",
  "localDbUrl": "postgres://postgres:postkit_local@localhost:15432/postkit_local",
  "remoteDbUrl": "postgres://...",
  "containerID": "abc123def456",
  "pendingChanges": {
    "planned": false,
    "applied": false,
    "planFile": null,
    "migrationFiles": [],
    "description": null,
    "schemaFingerprint": null,
    "migrationApplied": false,
    "seedsApplied": false
  }
}
```

> `containerID` is present only when PostKit started an auto Docker container. It is used by `postkit db abort` to stop and remove the container.

### Committed Migrations (`committed.json`)

Committed migrations are tracked in `.postkit/db/committed.json`. Deployment status is determined by querying the remote database's `postkit.schema_migrations` table — not stored locally.

```json
{
  "migrations": [
    {
      "migrationFile": {
        "name": "20260211_add_users.sql",
        "path": ".postkit/db/migrations/20260211_add_users.sql",
        "timestamp": "20260211120000"
      },
      "description": "Add users table",
      "sessionMigrations": [
        {"name": "20260211_120000_session.sql", "path": ".postkit/db/session/20260211_120000_session.sql"}
      ],
      "committedAt": "2026-02-11T12:00:00Z"
    }
  ]
}
```

Session migrations are staged in `.postkit/db/session/` and committed migrations are stored in `.postkit/db/migrations/`.

---

## 🔀 Cross-Schema Migrations

When your project uses multiple schemas (e.g. `public` and `app`), some changes cannot be expressed inside a single schema's SQL files — specifically anything that **references objects in another schema**. This section explains the limitation and the correct approach.

---

### What NOT to do

**Do not add cross-schema foreign keys inside pgschema-managed schema files.**

pgschema plans each schema independently. When it processes `db/schema/app/tables/order_item.sql`, it creates a temporary internal schema to analyse the desired state. That temporary environment does not contain `public.product` or any other schema's objects, so a FK like:

```sql
-- db/schema/app/tables/order_item.sql  ← DO NOT do this
CREATE TABLE app.order_item (
    product_id UUID NOT NULL REFERENCES public.product(id)  -- ❌ will fail pgschema plan
);
```

will fail with:

```
ERROR: relation "public.product" does not exist
```

Similarly, **do not write cross-schema views, functions, or triggers inside schema files** if they reference objects from another schema — pgschema cannot resolve them during planning.

---

### The correct approach — manual migration

Use `postkit db migration` to write a plain SQL migration that runs after both schemas exist. Manual migrations bypass pgschema entirely and are applied directly by dbmate, so all schemas and their objects are already present when the SQL executes.

**Step-by-step:**

```bash
# 1. Start a session as normal
postkit db start

# 2. Plan and apply your per-schema structural changes first
#    (tables, types, functions — without cross-schema refs)
postkit db plan
postkit db apply

# 3. Create a manual migration for the cross-schema constraint
postkit db migration add_cross_schema_fk
```

PostKit opens the migration file for you. Write the cross-schema SQL in the `-- migrate:up` section:

```sql
-- migrate:up

-- FK from app.order_item → public.product (added after both schemas exist)
ALTER TABLE app.order_item
    ADD CONSTRAINT fk_order_item_product
    FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE RESTRICT;

-- Cross-schema view in app referencing public.product
CREATE VIEW app.order_summary AS
SELECT oi.id, p.name AS product_name, oi.quantity
FROM app.order_item oi
JOIN public.product p ON p.id = oi.product_id;

-- migrate:down
ALTER TABLE app.order_item DROP CONSTRAINT IF EXISTS fk_order_item_product;
DROP VIEW IF EXISTS app.order_summary;
```

```bash
# 4. Apply the manual migration (dbmate runs it; all schemas are in place)
postkit db apply

# 5. Commit and deploy as normal
postkit db commit
postkit db deploy
```

---

### What belongs where

| Change type | Where to put it | Applied by |
|-------------|-----------------|------------|
| Tables, indexes, types, enums in one schema | `db/schema/<name>/tables/` etc. | pgschema → dbmate |
| RLS policies, grants in one schema | `db/schema/<name>/policies/` etc. | pgschema → dbmate |
| Cross-schema FK constraints | Manual migration (`postkit db migration`) | dbmate only |
| Cross-schema views / functions | Manual migration (`postkit db migration`) | dbmate only |
| Schema namespace creation (`CREATE SCHEMA`) | `db/infra/` | infra step (psql) |
| Role creation / extensions | `db/infra/` | infra step (psql) |

---

### Why the intermediate apply exists (and its limit)

During `postkit db plan`, each schema's plan is applied to the local database immediately after it is generated (called the *intermediate apply*). This means by the time `pgschema` plans schema `app`, the objects from schema `public` already exist in the local DB.

However, the *pgschema planning step itself* still fails on cross-schema FK references because pgschema analyses the schema file in its own isolated temporary environment — not the live local DB. The intermediate apply only helps with the **final apply step**, not the plan generation step.

This is why cross-schema constraints must be written as manual migrations rather than inline FK references in schema files.

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `pgschema is not installed` | Should be bundled in `vendor/pgschema/`. Verify the binary for your platform exists, or install manually and set `db.pgSchemaBin` in config. |
| `dbmate is not installed` | Should be installed via npm. Run `npm install` in the CLI directory, or install manually (`brew install dbmate`) and set `db.dbmateBin` in config. |
| `Failed to connect to remote database` | Check the remote URL in `postkit db remote list` |
| `No remotes configured` | Add a remote with `postkit db remote add <name> <url>` |
| `No active migration session` | Run `postkit db start` first |
| `Plan file is empty` | Schema files match current DB — make changes first |
| `Schema files have changed since the plan was generated` | Schema files were modified after running `plan`. Run `postkit db plan` again |
| `Seeds failed during apply` | Re-run `postkit db apply` — it resumes from where it left off |
| `Deploy failed during dry run` | No changes were made to the target. Fix the issue and retry. |
| `Docker not found` | Install Docker Desktop and ensure the `docker` binary is on your PATH. Docker is only required when `localDbUrl` is empty. |
| `Docker is not running` | Start Docker Desktop before running `postkit db start` or `postkit db deploy`. |
| `Failed to start container` | Check that the `postgres:{version}-alpine` image can be pulled. Ensure you have internet access or the image is already cached locally. |
| `Import: pgschema plan produced no output` | Schema directory may be empty after normalization. Check that the source DB has objects in the target schema. |
| `Import: Could not insert migration tracking record` | Non-fatal. The local DB migration succeeded but the source DB tracking record failed. Manually insert the version into `postkit.schema_migrations` on the source DB. |
| `Import: column does not exist during local apply` | Infrastructure SQL (roles, schemas) may not have been applied to the local database before dbmate. Ensure `schema/infra/` files exist and are valid. |
| `Import: relation does not exist during pgschema plan` | The `pgschema dump` ordering may not account for foreign key or policy dependencies. This is handled by pgschema internally. |
| `Plan: relation "other_schema.table" does not exist` | A schema file contains a cross-schema reference (e.g. `REFERENCES public.product(id)` inside `db/schema/app/`). pgschema cannot resolve cross-schema refs during planning. Remove the FK from the schema file and add it as a manual migration — see **Cross-Schema Migrations** above. |
| `Plan: Schema "public" has no directory — skipping` | The schema is listed in `db.schemas` in config but `db/schema/public/` does not exist on disk. Run `postkit db schema add public` to scaffold it, or remove `"public"` from `db.schemas` if you don't need it. |
