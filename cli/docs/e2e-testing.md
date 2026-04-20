# PostKit CLI — End-to-End (E2E) Testing Guide

## Overview

E2E tests verify PostKit CLI behavior by running the **compiled binary** as a black-box child process against real PostgreSQL databases. They test full command workflows from start to finish — no internal mocking.

```
Test Runner (vitest)
  └─ spawn: node dist/index.js <args> --force
       └─ PostgreSQL container (Docker)
```

## Quick Start

```bash
# Prerequisites: Docker must be running (only for Docker-based tests)
npm run test:e2e              # Build + run ALL 54 E2E tests
npm run test:e2e:fast         # Build + run only non-Docker tests (~2s)
npm run test:e2e:watch        # Build + watch mode
npm run test:all              # Unit tests + E2E tests
```

## Running Individual Tests

### NPM Scripts (recommended)

| Script | What It Runs | Docker | Time |
|--------|-------------|--------|------|
| `npm run test:e2e` | All 12 files, 54 tests | Yes | ~35s |
| `npm run test:e2e:fast` | Smoke + errors + remotes (20 tests) | No | ~2s |
| `npm run test:e2e:smoke` | Smoke tests only (7 tests) | No | ~1s |
| `npm run test:e2e:errors` | All error handling (8 tests) | No* | ~2s |
| `npm run test:e2e:workflows` | All workflows (26 tests) | Yes | ~30s |
| `npm run test:e2e:watch` | Watch mode (rerun on changes) | Yes | — |

*\* `test:e2e:errors` includes `conflict-detection` which needs Docker. The other 3 error files don't.*

### Run a Single File

```bash
# Pass any file path after the config flag
npm run test:e2e:file -- test/e2e/workflows/happy-path.test.ts
npm run test:e2e:file -- test/e2e/workflows/deploy-workflow.test.ts
npm run test:e2e:file -- test/e2e/error-handling/no-session.test.ts
```

### Run a Single Test Case by Name

```bash
# Match test name with -t flag
npm run test:e2e:file -- -t "starts a migration session" test/e2e/workflows/happy-path.test.ts
```

### Skip the Build (if already built)

```bash
# All npm scripts build first. To skip the build:
npx vitest run --config vitest.e2e.config.ts test/e2e/workflows/happy-path.test.ts
```

## Test Categories

| Category | Docker | Tests | Description |
|----------|--------|-------|-------------|
| Smoke | No | 7 | Basic CLI commands, no database needed |
| Remote Management | No | 5 | Remote CRUD operations |
| Error Handling (config) | No | 3 | Invalid/missing configuration |
| Error Handling (session) | No | 4 | Commands without active session |
| Error Handling (connection) | No | 1 | Unreachable database |
| Happy Path | Yes | 7 | Full start → migrate → apply → commit |
| Abort | Yes | 5 | Session abort and cleanup verification |
| Manual Migration | Yes | 5 | Manual SQL migration workflow |
| Deploy | Yes | 5 | Full cycle with two databases |
| Import | Yes | 3 | Import existing database |
| Infra/Seeds | Yes | 7 | Infrastructure and seed data |
| Conflict Detection | Yes | 2 | Duplicate session, unapplied changes |

---

---

## Test Details — What Each Test Verifies

### 1. Smoke Tests (`test/e2e/smoke/basic-commands.test.ts`)

**Docker: Not required | Tests: 7 | Run: ~1s**

Tests basic CLI behavior without any database. Verifies the binary works, help/flags are correct, and init scaffolds the right files.

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `prints version` | `--version` outputs semver and exits 0 | Binary is built correctly, package.json version is accessible |
| `prints help` | `--help` shows "PostKit" and "db" module | Commander.js registration works, user can discover commands |
| `prints db subcommand help` | `db --help` lists start, plan, apply, commit, deploy, status, abort | All db subcommands are registered and discoverable |
| `db status fails without config file` | `db status` in empty dir exits non-zero with "not initialized" | CLI prevents running commands before `postkit init` |
| `db status --json fails without config file` | `db status --json` in empty dir exits non-zero | JSON mode also guards against uninitialized projects |
| `init creates project structure` | `init --force` creates `postkit.config.json`, `.postkit/db/`, `.postkit/auth/`, `.gitignore` | Project scaffold is complete and config file has correct structure (db + auth sections) |
| `init --force re-initializes existing project` | `init --force` overwrites existing config | Force flag allows CI/automation to re-initialize without prompts |

### 2. Remote Management (`test/e2e/workflows/remote-management.test.ts`)

**Docker: Not required | Tests: 5 | Run: ~1s**

Tests the `db remote` subcommand group. Each test creates a fresh project to avoid state leakage.

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `lists remotes` | `db remote list` shows configured remote name | Users can verify their remotes are set up correctly |
| `adds a new remote` | `db remote add staging <url>` writes to `postkit.config.json` | Remotes persist across commands — config file is the source of truth |
| `adds a remote with --default flag` | `db remote add prod <url> --default` sets `default: true` | Default remote is auto-selected by `db start` and `db deploy` when no `--remote` flag given |
| `sets default remote with 'use'` | `db remote use staging` switches default flag | Users can change the default without removing/re-adding |
| `removes a remote with --force` | `db remote remove staging --force` deletes from config | Cleanup of stale remotes; `--force` skips confirmation prompt |

### 3. Happy Path Workflow (`test/e2e/workflows/happy-path.test.ts`)

**Docker: Required (1 container) | Tests: 7 | Run: ~4s**

The most important E2E test. Validates the complete migration session lifecycle — the primary user workflow.

```
Seed DB → Start Session → Create Migration → Apply → Commit → Verify
```

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `starts a migration session` | `db start --force` clones remote DB to local, creates `session.json` | Core session creation — all subsequent commands depend on this |
| `shows active session in status --json` | `db status --json` returns `{sessionActive: true}` | Machine-readable status for CI/automation integration |
| `creates a migration file manually` | `db migration add_posts_table --force` creates SQL file in `.postkit/db/session/` | Users can write custom SQL migrations without schema diff |
| `applies migration to local database` | Overwrites template with real `CREATE TABLE` SQL, then `db apply --force` runs dbmate | dbmate executes the SQL against local DB; migration tracking works |
| `verifies table was created in database` | Direct `pg` query confirms `posts` table exists | The migration actually modified the database — not just file operations |
| `commits the session migration` | `db commit --force --message "add_posts_table"` merges session files, cleans up session | Committed migrations are ready for deploy; session state is reset |
| `shows no active session after commit` | `db status --json` returns `sessionActive: false`, `pendingCommittedMigrations >= 1` | Commit properly resets session and tracks pending deployments |

### 4. Abort Workflow (`test/e2e/workflows/abort-workflow.test.ts`)

**Docker: Required (1 container) | Tests: 5 | Run: ~3s**

Verifies that aborting a session fully cleans up all artifacts — session files, plan, local database clone.

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `starts a session` | `db start --force` creates session | Precondition for abort test |
| `aborts the session` | `db abort --force` outputs "aborted" | Abort command completes without error |
| `verifies cleanup after abort` | `session.json` no longer exists on disk | No orphaned session state left behind |
| `shows no active session after abort` | `db status --json` returns `sessionActive: false` | Status reflects the aborted state correctly |
| `can start a new session after abort` | `db start --force` succeeds after abort (re-creates DB) | Abort doesn't permanently break the project — users can recover |

### 5. Manual Migration Workflow (`test/e2e/workflows/manual-migration.test.ts`)

**Docker: Required (1 container) | Tests: 5 | Run: ~3s**

Tests the manual migration path (user writes SQL by hand) as opposed to schema-diff-driven migrations.

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `starts a session` | `db start --force` creates session | Session required before creating migrations |
| `creates a manual migration file` | `db migration add_categories --force` creates template file | Template has proper `-- migrate:up/down` markers for dbmate |
| `applies the manual migration` | Overwrites template with `CREATE TABLE` SQL, runs `db apply --force` | Manual SQL is executed against local DB via dbmate |
| `verifies table was created in database` | Direct query confirms `categories` table exists | Manual migration SQL actually ran |
| `commits the manual migration` | `db commit --force --message "add_categories"` merges and cleans up | Manual migrations go through same commit flow as plan-based ones |

### 6. Deploy Workflow (`test/e2e/workflows/deploy-workflow.test.ts`)

**Docker: Required (2 containers) | Tests: 5 | Run: ~8s**

The most complex test. Spins up two separate PostgreSQL containers because `deploy` requires `localDbUrl !== remoteUrl`. Tests the full cycle: develop locally, deploy to remote.

```
Start Session → Create Migration → Apply Local → Commit → Deploy Remote → Verify Remote
```

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `starts a session from remote` | `db start --force` clones remote DB | Remote cloning works across different hosts |
| `creates and applies a manual migration` | Migration created, SQL written, `db apply --force` runs | Local development cycle works |
| `commits the migration` | `db commit --force --message` merges session files | Migration is packaged for deployment |
| `deploys to remote database` | `db deploy --force` runs dry-run on local clone, then applies to remote | Deploy includes safety dry-run; remote DB receives changes |
| `verifies table exists in remote database` | Direct query on **remote** container confirms `deploy_test` table | Changes actually reached the remote database, not just local |

### 7. Import Workflow (`test/e2e/workflows/import-workflow.test.ts`)

**Docker: Required (1 container) | Tests: 3 | Run: ~20s**

Tests importing an existing database into PostKit. This is typically the first command users run on an existing project — it creates baseline schema files and a baseline migration.

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `imports an existing database` | Seeds DB with `categories` + `products` tables, runs `db import --force` | pgschema dump + normalize works; baseline migration is created |
| `creates schema files from imported database` | `schema/tables/` contains SQL files after import | Database schema is decomposed into PostKit's file structure |
| `creates baseline migration in committed migrations` | `.postkit/db/migrations/` has a baseline SQL file | Baseline migration tracks the imported state for future diffs |

### 8. Infra & Seeds Workflow (`test/e2e/workflows/infra-grants-seeds.test.ts`)

**Docker: Required (1 container) | Tests: 7 | Run: ~3s**

Tests infrastructure SQL (extensions, roles, schemas) and seed data management. These run outside the plan/apply cycle.

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `shows no infra files initially` | `db infra` reports no files found | Handles empty state gracefully |
| `shows no seed files initially` | `db seed` reports no files found | Handles empty state gracefully |
| `creates infra file and shows generated SQL` | Writes `uuid-ossp` extension to `schema/infra/`, `db infra` shows it | Infra SQL is detected and rendered for review |
| `applies infra to local database` | `db infra --apply` installs `uuid-ossp` extension | Extension is actually created in PostgreSQL |
| `creates seed file and shows generated SQL` | Writes INSERT SQL to `schema/seeds/`, `db seed` shows it | Seed SQL is detected and rendered for review |
| `applies seeds to local database` | `db seed --apply` executes INSERT statements | Seed data is inserted into the table |
| `verifies seed data in database` | Direct query confirms 2 seeded rows exist | Seeds were actually persisted |

### 9. Invalid Configuration (`test/e2e/error-handling/invalid-config.test.ts`)

**Docker: Not required | Tests: 3 | Run: ~0.5s**

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `fails when config file is missing` | `db status` in empty directory | CLI guards against running before `postkit init` |
| `fails when no remotes configured` | Config with empty `remotes` object | `db start` requires at least one remote to clone from |
| `fails when localDbUrl is invalid` | Config with unreachable host:port | Connection errors surface clearly, not as unhandled exceptions |

### 10. No Active Session (`test/e2e/error-handling/no-session.test.ts`)

**Docker: Not required | Tests: 4 | Run: ~0.5s**

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `plan fails without active session` | `db plan` → "No active migration session" | Plan requires a session with a local DB clone |
| `apply fails without active session` | `db apply --force` → "No active migration session" | Apply can't run without a local target database |
| `commit fails without active session` | `db commit --force -m "x"` → "No active migration session" | Commit requires an active session with applied changes |
| `abort gracefully handles no session` | `db abort --force` → succeeds, shows "No active migration session" | Abort is idempotent — safe to run even without a session |

### 11. Connection Failure (`test/e2e/error-handling/connection-failure.test.ts`)

**Docker: Not required | Tests: 1 | Run: ~0.1s**

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `start fails when remote is unreachable` | Config pointing to `nonexistent-host-99999` | Network errors are caught and reported, not crashed |

### 12. Conflict Detection (`test/e2e/error-handling/conflict-detection.test.ts`)

**Docker: Required (1 container) | Tests: 2 | Run: ~3s**

| Test | What It Tests | Why It Matters |
|------|---------------|----------------|
| `start fails when session already active` | Second `db start` → "active migration session already exists" | Prevents accidental session overwrite |
| `commit fails when changes not applied` | `db commit` without `db apply` → "not been applied" | Prevents committing untested changes |

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
await tableExists(db.url, "posts");           // boolean
await getTableRowCount(db.url, "posts");      // number
await getTableCount(db.url);                  // number
await executeSql(db.url, "CREATE TABLE…");    // void
await ensureDatabaseExists(db.url);           // re-create after abort drops it
```

Direct `pg` queries for verifying database state after CLI commands. Uses fresh connections per query. `ensureDatabaseExists()` connects to the default `postgres` DB to re-create the test database (needed after `abort` drops it).

#### `schema-builder.ts` — Schema File Scaffolding

```typescript
await writeTableSchema(project, "users", SIMPLE_TABLE_DDL);
await writeInfraFile(project, "extensions", SIMPLE_INFRA_SQL);
await writeSeedFile(project, "initial_data", SIMPLE_SEED_SQL);
```

Creates SQL files in the correct schema subdirectories (`tables/`, `infra/`, `grants/`, `seeds/`). Provides ready-made DDL templates.

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
├── helpers/
│   ├── cli-runner.ts          # Spawns CLI as child process
│   ├── test-project.ts        # Temp project directories
│   ├── test-database.ts       # Docker PostgreSQL containers
│   ├── db-query.ts            # Direct DB queries for verification
│   └── schema-builder.ts      # Schema file scaffolding + DDL templates
├── smoke/
│   └── basic-commands.test.ts # Version, help, init, status (no Docker)
├── workflows/
│   ├── happy-path.test.ts     # Full start→apply→commit cycle
│   ├── abort-workflow.test.ts # Session abort and cleanup
│   ├── manual-migration.test.ts  # Manual SQL migration
│   ├── deploy-workflow.test.ts   # Deploy to remote (2 containers)
│   ├── import-workflow.test.ts   # Import existing database
│   ├── infra-grants-seeds.test.ts # Infra, grants, seeds
│   └── remote-management.test.ts # Remote CRUD (no Docker)
└── error-handling/
    ├── invalid-config.test.ts     # Missing/bad config
    ├── no-session.test.ts         # Commands without session
    ├── connection-failure.test.ts # Unreachable database
    └── conflict-detection.test.ts # Duplicate session, unapplied
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
   ```

3. Use `--force` flag on commands that support it (`start`, `apply`, `commit`, `abort`, `migration`, `deploy`, `import`, `remote remove`).

4. After `db abort` drops the database, call `ensureDatabaseExists(db.url)` before re-seeding.

5. Always clean up in `afterAll`:
   ```typescript
   afterAll(async () => {
     if (project) await cleanupTestProject(project);
     if (db) await stopPostgres(db);
   });
   ```

6. Run: `npx vitest run --config vitest.e2e.config.ts test/e2e/your-new-test.test.ts`
