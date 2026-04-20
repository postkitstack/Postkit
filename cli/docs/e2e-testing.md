# PostKit CLI — End-to-End (E2E) Testing Guide

## Overview

E2E tests verify PostKit CLI behavior by running the **compiled binary** as a black-box child process against real PostgreSQL databases. They test full command workflows from start to finish — no internal mocking.

```
Test Runner (vitest)
  └─ spawn: node dist/index.js <args> --force
       └─ PostgreSQL container (Docker)
```

All workflow tests use a **predefined fixture schema** (`test/e2e/fixtures/schema/`) that mirrors real project structure — tables with UUID PKs, CHECK constraints, indexes, RLS policies, grants per role, idempotent seeds, triggers, functions, and views.

## Quick Start

```bash
# Prerequisites: Docker must be running (only for Docker-based tests)
npm run test:e2e              # Build + run ALL E2E tests
npm run test:e2e:fast         # Build + run only non-Docker tests (~2s)
npm run test:e2e:watch        # Build + watch mode
npm run test:all              # Unit tests + E2E tests
```

## Running Individual Tests

### NPM Scripts (recommended)

| Script | What It Runs | Docker | Time |
|--------|-------------|--------|------|
| `npm run test:e2e` | All 12 files | Yes | ~35s |
| `npm run test:e2e:fast` | Smoke + errors + remotes | No | ~2s |
| `npm run test:e2e:smoke` | Smoke tests only | No | ~1s |
| `npm run test:e2e:errors` | All error handling | No* | ~2s |
| `npm run test:e2e:workflows` | All workflow cases | Yes | ~30s |
| `npm run test:e2e:watch` | Watch mode (rerun on changes) | Yes | — |

*\* `test:e2e:errors` includes `conflict-detection` which needs Docker. The other 3 error files don't.*

### Run a Single File

```bash
# Pass any file path after the config flag
npm run test:e2e:file -- test/e2e/workflows/case-1-empty-db-full-flow.test.ts
npm run test:e2e:file -- test/e2e/workflows/case-3-double-plan.test.ts
npm run test:e2e:file -- test/e2e/error-handling/no-session.test.ts
```

### Run a Single Test Case by Name

```bash
# Match test name with -t flag
npm run test:e2e:file -- -t "starts a migration session" test/e2e/workflows/case-1-empty-db-full-flow.test.ts
```

### Skip the Build (if already built)

```bash
# All npm scripts build first. To skip the build:
npx vitest run --config vitest.e2e.config.ts test/e2e/workflows/case-1-empty-db-full-flow.test.ts
```

## Test Categories

| Category | Docker | Description |
|----------|--------|-------------|
| Smoke | No | Basic CLI commands, no database needed |
| Remote Management | No | Remote CRUD operations |
| Error Handling | No* | Invalid config, no session, connection failure, conflicts |
| Case 1: Empty DB Full Flow | Yes (2 containers) | start → plan → apply → commit → deploy |
| Case 2: Manual Migration | Yes (2 containers) | start → plan → apply → migration → apply → commit → deploy |
| Case 3: Double Plan | Yes (2 containers) | start → plan → apply → add schema → plan → apply → commit → deploy |
| Case 4: Existing DB Import | Yes (2 containers) | import → verify → plan → apply → commit → deploy |
| Abort Workflow | Yes (1 container) | Session abort and cleanup verification |
| Infra/Grants/Seeds | Yes (1 container) | Infrastructure, grants, seed data, idempotency |

---

## Fixture Schema

All workflow tests use a predefined fixture schema at `test/e2e/fixtures/schema/` that mirrors the real project structure at `test-proj/schema/`. The fixture uses **different role and table names** to keep tests self-contained.

### Fixture Structure

```
test/e2e/fixtures/schema/
├── infra/
│   └── 01_core_initiate.sql          # Roles: api_user, readonly, editor, manager
├── core/
│   └── 01_update_updated_at.sql      # Trigger function: update_updated_at()
├── tables/
│   ├── 01_category.table.sql         # UUID PK, CHECK constraint, indexes, is_deleted
│   └── 02_product.table.sql          # FK to category, price CHECK, status CHECK, indexes
├── rls/
│   ├── 01_category.rls.sql           # RLS policies per role (manager, editor, readonly)
│   └── 02_product.rls.sql            # RLS policies with status-aware rules
├── grant-permissions/
│   ├── category.grant.sql            # GRANT per role per table
│   └── product.grant.sql             # GRANT per role per table
├── seed/
│   └── 01_seed_categories.sql        # Idempotent inserts with WHERE NOT EXISTS
├── trigger/
│   ├── 01_category.trigger.sql       # update_category_timestamp trigger
│   └── 02_product.trigger.sql        # update_product_timestamp trigger
├── function/
│   └── 01_get_products_by_category.function.sql  # PL/pgSQL function
└── view/
    └── 01_products_with_category.view.sql         # View with JOIN + security_invoker
```

### Using the Fixture in Tests

```typescript
import {installFixtureSchema, installFixtureSections, FIXTURE_TABLES} from "../helpers/schema-builder";

// Install the entire fixture schema into a test project
await installFixtureSchema(project);

// Or install only specific sections
await installFixtureSections(project, ["infra", "core", "tables", "rls"]);

// Constants for assertions
FIXTURE_TABLES     // ["category", "product"]
FIXTURE_ROLES      // ["api_user", "readonly", "editor", "manager"]
```

---

## Test Details — What Each Test Verifies

### Case 1: Empty DB Full Flow (`case-1-empty-db-full-flow.test.ts`)

**Docker: Required (2 containers) | Run: ~8s**

The most important E2E test. Both databases start completely empty. The full fixture schema is installed in the project directory. Tests the complete lifecycle from session creation to remote deployment.

```
start → plan → apply → commit → deploy (remote)
```

| Step | What It Tests | Why It Matters |
|------|---------------|----------------|
| Start session | `db start --force` clones empty remote, creates session.json | Core session creation works even with empty remote |
| Plan | `db plan` generates diff for all fixture tables (category, product) | pgschema detects all schema files against empty DB |
| Apply | `db apply --force` creates tables, RLS, triggers, functions, views | dbmate executes all SQL against local DB |
| Verify local | Tables exist, RLS enabled, triggers attached, functions/views created | Full schema was applied correctly |
| Commit | `db commit --force` merges session migrations, cleans up session | Migrations are packaged for deployment |
| Deploy | `db deploy --force` pushes to remote database | Remote receives all changes |
| Verify remote | Tables, RLS, triggers, functions, views exist in remote | Deploy actually modified the remote database |

### Case 2: Manual Migration (`case-2-manual-migration.test.ts`)

**Docker: Required (2 containers) | Run: ~10s**

Installs the full fixture schema and applies it first, then creates an additional manual migration on top using the `db migration` command. Tests the mix of schema-driven and hand-written SQL migrations.

```
start → plan → apply → migration <name> → apply → commit → deploy
```

| Step | What It Tests | Why It Matters |
|------|---------------|----------------|
| Start + Plan + Apply | Applies full fixture schema to local DB | Base state is established |
| Create migration | `db migration add_product_tags --force` creates template file | Migration command generates proper template with `-- migrate:up/down` markers |
| Inject SQL | Replaces `-- Add your SQL migration here` placeholder with actual tag + product_tag SQL | Template format is preserved — only placeholder is replaced |
| Apply again | `db apply --force` applies the manual migration | Multiple applies within one session work |
| Commit + Deploy | Commits and deploys everything | Both schema-driven and manual migrations are deployed together |
| Verify remote | Fixture tables AND manual migration tables exist in remote | All changes reached the remote database |

### Case 3: Double Plan (`case-3-double-plan.test.ts`)

**Docker: Required (2 containers) | Run: ~10s**

Starts with a partial schema (category only), applies it, then adds more schema files (product + RLS + trigger + function + view). Tests that a second `plan` correctly picks up the new additions.

```
start → plan → apply → add schema → plan → apply → commit → deploy
```

| Step | What It Tests | Why It Matters |
|------|---------------|----------------|
| First plan + apply | Creates only category table in local DB | Partial schema applies correctly |
| Add schema files | Adds product table, RLS, trigger, function, view files | Schema evolves during development |
| Second plan | `db plan` detects the newly added schema files | pgschema diff picks up incremental changes |
| Second apply | Creates product + RLS + trigger + function + view in local DB | Incremental migration works |
| Commit + Deploy | All changes committed and deployed | Both first and second plan changes reach remote |
| Verify remote | All tables, RLS, triggers, functions, views in remote | Full incremental schema deployed correctly |

### Case 4: Existing DB Import (`case-4-existing-db-import.test.ts`)

**Docker: Required (2 containers) | Run: ~20s**

Simulates an existing production database. Seeds the remote with the full fixture schema (tables, triggers, seed data), then imports it into PostKit. After import, adds a new view and runs the full plan → apply → commit → deploy cycle.

```
import → verify schema files → start → plan → apply → commit → deploy
```

| Step | What It Tests | Why It Matters |
|------|---------------|----------------|
| Import | Seeds remote with fixture schema, runs `db import --force` | pgschema dump + normalize works on real schema |
| Verify schema files | Tables, functions, triggers directories contain SQL files | Database schema is decomposed into PostKit's file structure |
| Baseline migration | `.postkit/db/migrations/` has a baseline SQL file | Baseline tracks imported state for future diffs |
| Start + Plan + Apply | Adds a new view, plans the diff, applies to local | Import → develop → apply cycle works |
| Commit + Deploy | Commits and deploys the view to remote | New changes deploy on top of imported baseline |
| Verify remote | View exists, seed data intact | Deploy preserves existing data |

### Abort Workflow (`abort-workflow.test.ts`)

**Docker: Required (1 container) | Run: ~3s**

Verifies that aborting a session fully cleans up all artifacts.

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| Start session | `db start --force` creates session | Precondition for abort |
| Abort | `db abort --force` outputs "aborted" | Abort completes without error |
| Cleanup verified | `session.json` no longer exists | No orphaned session state |
| Status reflects abort | `db status --json` returns `sessionActive: false` | Status is accurate |
| Can restart | `db start --force` succeeds after abort | Abort doesn't permanently break the project |

### Infra, Grants & Seeds (`infra-grants-seeds.test.ts`)

**Docker: Required (1 container) | Run: ~3s**

Tests infrastructure SQL (roles), grant permissions, and seed data management. Uses the fixture schema's infra, grants, and seed sections.

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| Shows infra | `db infra` displays role creation SQL (api_user, readonly, editor, manager) | Infra SQL is detected and rendered |
| Applies infra | `db infra --apply` creates roles in PostgreSQL | Roles are created with proper DO$$ guards |
| Shows grants | `db grants` displays GRANT per role per table | Grant SQL is detected and rendered |
| Applies grants | `db grants --apply` grants permissions to roles | Role-based access control is set up |
| Shows seeds | `db seed` displays idempotent seed data | Seed SQL is detected and rendered |
| Applies seeds | `db seed --apply` inserts seed data | Idempotent inserts work (WHERE NOT EXISTS) |
| Verifies seed data | Direct query confirms 3 seeded categories | Seeds were persisted |
| Idempotency check | Running `db seed --apply` again doesn't duplicate data | WHERE NOT EXISTS prevents duplicates |

### Smoke Tests (`smoke/basic-commands.test.ts`)

**Docker: Not required | Run: ~1s**

| Test | What It Tests |
|------|---------------|
| `--version` | Binary is built correctly, version accessible |
| `--help` | Commander.js registration works |
| `db --help` | All db subcommands are registered |
| `db status` in empty dir | CLI prevents running before init |
| `init --force` | Creates complete project scaffold |
| `init --force` re-init | Force flag allows re-initialization |

### Remote Management (`remote-management.test.ts`)

**Docker: Not required | Run: ~1s**

| Test | What It Tests |
|------|---------------|
| `db remote list` | Shows configured remote name |
| `db remote add` | Persists to `postkit.config.json` |
| `db remote add --default` | Sets `default: true` flag |
| `db remote use` | Switches default remote |
| `db remote remove --force` | Deletes from config |

### Error Handling (4 files)

| File | Tests |
|------|-------|
| `invalid-config.test.ts` | Missing config, no remotes, invalid URL |
| `no-session.test.ts` | plan/apply/commit without session, abort idempotency |
| `connection-failure.test.ts` | Unreachable host |
| `conflict-detection.test.ts` | Double start, commit without apply |

---

## Test Infrastructure

### Helper Modules

All helpers live in `test/e2e/helpers/`.

#### `cli-runner.ts` — CLI Process Spawner

```typescript
const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
// result.stdout, result.stderr, result.exitCode, result.failed
```

Spawns `node dist/index.js` via `execa`. Disables color (`FORCE_COLOR=0`), unsets `EDITOR`/`VISUAL` (prevents editor spawn hang), captures stdout/stderr/exit code.

#### `test-project.ts` — Temp Project Manager

```typescript
const project = await createTestProject({
  localDbUrl: db.url,
  remoteDbUrl: db.url,
  remoteName: "dev",
});
// project.rootDir, project.configPath, project.dbDir, project.schemaPath
```

Creates an isolated temp directory with `postkit.config.json`, `.postkit/db/` structure, and schema directories. Auto-cleaned in `afterAll`. Also provides `fileExists()`, `readFile()`, `readJson()`, `writeFile()` for verification.

#### `test-database.ts` — Docker PostgreSQL

```typescript
const db = await startPostgres();                      // Single container
const {local, remote} = await startPostgresPair();     // Two containers (for deploy)
```

Uses testcontainers to spin up `postgres:16-alpine` containers. Waits for PostgreSQL readiness log before returning. Each test suite gets a fresh, isolated database.

#### `db-query.ts` — Database Verification

```typescript
await tableExists(db.url, "category");        // boolean
await getTableRowCount(db.url, "category");   // number
await getTableCount(db.url);                  // number
await executeSql(db.url, "CREATE TABLE…");    // void
await queryDatabase(db.url, "SELECT…");       // rows[]
await ensureDatabaseExists(db.url);           // re-create after abort drops it
```

Direct `pg` queries for verifying database state after CLI commands. Uses fresh connections per query.

#### `schema-builder.ts` — Fixture Schema & Schema File Writers

```typescript
// Install the full predefined fixture schema
await installFixtureSchema(project);

// Or install specific sections
await installFixtureSections(project, ["infra", "core", "tables", "rls"]);

// Write individual schema files
await writeTableSchema(project, "01_category", ddl);
await writeRlsFile(project, "01_category", rlsSql);
await writeTriggerFile(project, "01_category", triggerSql);
await writeFunctionFile(project, "01_func", funcSql);
await writeViewFile(project, "01_view", viewSql);
await writeCoreFile(project, "01_core", coreSql);
await writeInfraFile(project, "extensions", sql);
await writeGrantFile(project, "category", grantSql);
await writeSeedFile(project, "initial_data", seedSql);
```

Copies the predefined fixture schema into the test project's schema directory, or writes individual SQL files. Provides constants: `FIXTURE_TABLES`, `FIXTURE_ROLES`, `FIXTURE_SEED_CATEGORY_IDS`.

#### `workflow.ts` — Workflow Actions & DB Verification

Reusable functions for common CLI operations and database verification. Used by all Case 1-4 workflow tests.

**CLI Actions:**
```typescript
await startSession(project);                    // db start --force
const output = await runPlan(project);          // db plan → returns stdout
await runApply(project);                        // db apply --force
await runCommit(project, "message");            // db commit --force --message
await runDeploy(project);                       // db deploy --force
const status = await getStatus(project);        // db status --json → parsed object
await createManualMigration(project, "name", sql); // db migration + inject SQL into template
```

**Database Verification:**
```typescript
await verifyTablesExist(dbUrl, ["category", "product"], "label");
await verifyRlsEnabled(dbUrl, ["category", "product"], "label");
await verifyTriggersExist(dbUrl, ["update_category_timestamp"], "label");
await verifyFunctionsExist(dbUrl, ["update_updated_at"], "label");
await verifyViewsExist(dbUrl, ["products_with_category"], "label");
await verifyIndexesExist(dbUrl, "product", ["idx_product_sku", "idx_product_category_id"]);
await verifyFixtureSchema(dbUrl, "label");       // All of the above in one call
```

### Vitest Configuration

Two separate configs keep unit and E2E tests isolated:

| | Unit (`vitest.config.ts`) | E2E (`vitest.e2e.config.ts`) |
|---|---|---|
| Include | `test/**/*.test.ts` | `test/e2e/**/*.test.ts` |
| Exclude | `test/e2e/**` | — |
| Timeout | Default (10s) | 60s test / 45s hook |
| Workers | Default | 1 (sequential) |
| Coverage | Enabled (v8) | Disabled |
| Build | Not needed | Runs `npm run build` first |

### Directory Structure

```
test/e2e/
├── fixtures/
│   └── schema/                     # Predefined test schema (13 SQL files)
│       ├── infra/                  # Roles: api_user, readonly, editor, manager
│       ├── core/                   # update_updated_at() function
│       ├── tables/                 # category + product (UUID PKs, CHECK, indexes, FKs)
│       ├── rls/                    # RLS policies per role per table
│       ├── grant-permissions/      # GRANT per role per table
│       ├── seed/                   # Idempotent seed data (WHERE NOT EXISTS)
│       ├── trigger/                # update_*_timestamp triggers
│       ├── function/               # get_products_by_category() PL/pgSQL
│       └── view/                   # products_with_category view
├── helpers/
│   ├── cli-runner.ts               # Spawns CLI as child process
│   ├── test-project.ts             # Temp project directories
│   ├── test-database.ts            # Docker PostgreSQL containers
│   ├── db-query.ts                 # Direct DB queries for verification
│   ├── schema-builder.ts           # Fixture schema install + schema file writers
│   └── workflow.ts                 # Workflow actions + DB verification helpers
├── smoke/
│   └── basic-commands.test.ts      # Version, help, init, status (no Docker)
├── workflows/
│   ├── case-1-empty-db-full-flow.test.ts      # start → plan → apply → commit → deploy
│   ├── case-2-manual-migration.test.ts         # + manual migration in the middle
│   ├── case-3-double-plan.test.ts              # + change schema → second plan
│   ├── case-4-existing-db-import.test.ts       # import existing DB → full cycle
│   ├── abort-workflow.test.ts                  # Session abort and cleanup
│   ├── infra-grants-seeds.test.ts              # Infra, grants, seeds + idempotency
│   └── remote-management.test.ts               # Remote CRUD (no Docker)
└── error-handling/
    ├── invalid-config.test.ts                  # Missing/bad config
    ├── no-session.test.ts                      # Commands without session
    ├── connection-failure.test.ts              # Unreachable database
    └── conflict-detection.test.ts              # Duplicate session, unapplied
```

---

## CI/CD Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd cli && npm ci
      - run: cd cli && npm run test:e2e
        timeout-minutes: 10
```

GitHub Actions runners have Docker pre-installed, so testcontainers works without extra configuration.

---

## Adding New E2E Tests

1. Create a test file in the appropriate directory:
   - `test/e2e/workflows/` for end-to-end workflows
   - `test/e2e/error-handling/` for error scenarios
   - `test/e2e/smoke/` for quick checks without Docker

2. Import helpers:
   ```typescript
   import {runCli} from "../helpers/cli-runner";
   import {createTestProject, cleanupTestProject} from "../helpers/test-project";
   import {startPostgres, stopPostgres} from "../helpers/test-database";
   import {executeSql, tableExists, ensureDatabaseExists} from "../helpers/db-query";
   import {installFixtureSchema, FIXTURE_TABLES} from "../helpers/schema-builder";
   ```

3. Use `--force` flag on commands that support it (`start`, `apply`, `commit`, `abort`, `migration`, `deploy`, `import`, `remote remove`).

4. For deploy tests, use `startPostgresPair()` to get two separate containers (local ≠ remote).

5. After `db abort` drops the database, call `ensureDatabaseExists(db.url)` before re-seeding.

6. When using `db migration <name>`, read the created file and replace the `-- Add your SQL migration here` placeholder — keep the template structure intact (`-- migrate:up`, `SET search_path`, `-- migrate:down`).

7. Always clean up in `afterAll`:
   ```typescript
   afterAll(async () => {
     if (project) await cleanupTestProject(project);
     if (localDb || remoteDb) await stopPostgresPair({local: localDb, remote: remoteDb});
   });
   ```

8. Run: `npx vitest run --config vitest.e2e.config.ts test/e2e/your-new-test.test.ts`
