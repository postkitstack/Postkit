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
# Prerequisites: Docker must be running
npm run test:e2e              # Build + run all E2E tests
npm run test:e2e:watch        # Build + watch mode
npm run test:all              # Unit tests + E2E tests
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

## E2E Workflows

### 1. Smoke Tests

**File:** `test/e2e/smoke/basic-commands.test.ts`
**Docker:** Not required

Tests basic CLI behavior without any database or project setup.

| Test Case | Command | Verifies |
|-----------|---------|----------|
| Version | `postkit --version` | Prints semver, exit 0 |
| Help | `postkit --help` | Shows "PostKit" and "db" |
| DB help | `postkit db --help` | Lists all subcommands |
| Status without init | `postkit db status` | Non-zero exit, error message |
| Status JSON without init | `postkit db status --json` | Non-zero exit |
| Init | `postkit init --force` | Creates config, `.postkit/`, `.gitignore` |
| Re-init | `postkit init --force` | Re-initialization succeeds |

### 2. Remote Management

**File:** `test/e2e/workflows/remote-management.test.ts`
**Docker:** Not required

Tests the `db remote` subcommand group for managing named database remotes.

| Test Case | Commands | Verifies |
|-----------|----------|----------|
| List remotes | `db remote list` | Shows configured remote name |
| Add remote | `db remote add staging <url>` | Config file updated with new remote |
| Add with default | `db remote add prod <url> --default` | Remote marked as default |
| Set default | `db remote use staging` | Default flag switches |
| Remove remote | `db remote remove staging --force` | Remote removed from config |

### 3. Happy Path Workflow

**File:** `test/e2e/workflows/happy-path.test.ts`
**Docker:** Required (1 container)

The core migration workflow — the most important E2E test.

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
│  Seed    │───▶│  Start   │───▶│Migration │───▶│  Apply   │───▶│ Commit  │
│Remote DB │    │ Session  │    │  Create  │    │  Local   │    │Session  │
└─────────┘    └──────────┘    └──────────┘    └──────────┘    └─────────┘
```

| Step | Command | Verification |
|------|---------|--------------|
| 1 | `db start --force` | Session started, `session.json` created |
| 2 | `db status --json` | `sessionActive: true` |
| 3 | `db migration add_posts_table --force` | Migration file created in `.postkit/db/session/` |
| 4 | `db apply --force` | Migration applied, output contains "applied" |
| 5 | Direct DB query | `posts` table exists in database |
| 6 | `db commit --force --message "add_posts_table"` | Session cleaned up, committed migration exists |
| 7 | `db status --json` | `sessionActive: false`, `pendingCommittedMigrations >= 1` |

### 4. Abort Workflow

**File:** `test/e2e/workflows/abort-workflow.test.ts`
**Docker:** Required (1 container)

Verifies that aborting a session cleans up all state properly.

```
┌─────────┐    ┌──────────┐    ┌─────────┐    ┌──────────────┐
│  Start  │───▶│  Abort   │───▶│ Verify  │───▶│ Start Again  │
│ Session │    │ --force  │    │ Cleanup │    │  (optional)  │
└─────────┘    └──────────┘    └─────────┘    └──────────────┘
```

| Step | Command | Verification |
|------|---------|--------------|
| 1 | `db start --force` | Session active |
| 2 | `db abort --force` | Output contains "aborted" |
| 3 | Filesystem check | `session.json` deleted |
| 4 | `db status --json` | `sessionActive: false` |
| 5 | `db start --force` | New session can start after abort |

### 5. Manual Migration Workflow

**File:** `test/e2e/workflows/manual-migration.test.ts`
**Docker:** Required (1 container)

Tests creating a migration by hand (not via schema diff), applying it, and committing.

| Step | Command | Verification |
|------|---------|--------------|
| 1 | `db start --force` | Session started |
| 2 | `db migration add_categories --force` | Migration file created |
| 3 | Overwrite with real SQL | File contains CREATE TABLE |
| 4 | `db apply --force` | Migration applied |
| 5 | Direct DB query | `categories` table exists |
| 6 | `db commit --force --message "add_categories"` | Committed, session cleaned up |

### 6. Deploy Workflow

**File:** `test/e2e/workflows/deploy-workflow.test.ts`
**Docker:** Required (2 containers — local + remote)

The most complex test. Verifies the full migration lifecycle including deployment to a separate remote database. The `deploy` command requires `localDbUrl !== remoteUrl`, hence two containers.

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
│  Start  │───▶│Migration │───▶│  Apply   │───▶│  Commit  │───▶│  Deploy  │───▶│ Verify  │
│Session  │    │  Create  │    │  Local   │    │  Session │    │  Remote  │    │ Remote  │
└─────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └─────────┘
```

| Step | Command | Verification |
|------|---------|--------------|
| 1 | `db start --force` | Session started from remote DB |
| 2 | `db migration <name> --force` | Migration file created |
| 3 | `db apply --force` | Migration applied to local DB |
| 4 | `db commit --force --message <msg>` | Migration committed |
| 5 | `db deploy --force` | Deployed to remote (includes dry-run) |
| 6 | Direct query on remote | `deploy_test` table exists in remote DB |

### 7. Import Workflow

**File:** `test/e2e/workflows/import-workflow.test.ts`
**Docker:** Required (1 container)

Tests importing an existing database into PostKit as a baseline migration.

| Step | Command | Verification |
|------|---------|--------------|
| 1 | Seed DB with tables | `categories` and `products` created |
| 2 | `db import --force --name "initial_baseline"` | Import completes |
| 3 | Check `schema/tables/` | SQL files generated from DB dump |
| 4 | Check `.postkit/db/migrations/` | Baseline migration file created |

### 8. Infra & Seeds Workflow

**File:** `test/e2e/workflows/infra-grants-seeds.test.ts`
**Docker:** Required (1 container)

Tests infrastructure SQL (extensions, roles) and seed data management.

| Step | Command | Verification |
|------|---------|--------------|
| 1 | `db infra` | "No infra files found" (empty initially) |
| 2 | `db seed` | "No seed files found" (empty initially) |
| 3 | Write infra file | `schema/infra/extensions.sql` created |
| 4 | `db infra` | Output shows `uuid-ossp` extension |
| 5 | `db infra --apply` | Extension installed in database |
| 6 | Write seed file | `schema/seeds/initial_data.sql` created |
| 7 | `db seed` | Output shows seed data |
| 8 | `db seed --apply` | Seeds applied to database |

---

## Error Handling Tests

### Invalid Configuration

**File:** `test/e2e/error-handling/invalid-config.test.ts`
**Docker:** Not required

| Test | Setup | Expected |
|------|-------|----------|
| Missing config | Empty directory | Error: "not initialized" |
| No remotes | Config with empty remotes | Error mentions "remote" |
| Invalid DB URL | Config with bad URL | Non-zero exit code |

### No Active Session

**File:** `test/e2e/error-handling/no-session.test.ts`
**Docker:** Not required

| Test | Command | Expected |
|------|---------|----------|
| Plan without session | `db plan` | Error: "No active migration session" |
| Apply without session | `db apply --force` | Error: "No active migration session" |
| Commit without session | `db commit --force -m "x"` | Error: "No active migration session" |
| Abort without session | `db abort --force` | Graceful: "No active migration session" |

### Connection Failures

**File:** `test/e2e/error-handling/connection-failure.test.ts`
**Docker:** Not required

| Test | Setup | Expected |
|------|-------|----------|
| Unreachable remote | Config pointing to invalid host | Non-zero exit, connection error |

### Conflict Detection

**File:** `test/e2e/error-handling/conflict-detection.test.ts`
**Docker:** Required (1 container)

| Test | Scenario | Expected |
|------|----------|----------|
| Duplicate session | `db start` when session already active | Error: "active migration session already exists" |
| Unapplied changes | `db commit` without `db apply` first | Error: "not been applied" |

---

## Test Infrastructure

### Helper Modules

All helpers live in `test/e2e/helpers/`.

#### `cli-runner.ts` — CLI Process Spawner

```typescript
const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
// result.stdout, result.stderr, result.exitCode, result.failed
```

Spawns `node dist/index.js` via `execa`. Disables color output (`FORCE_COLOR=0`) for reliable assertions. Captures stdout, stderr, and exit code.

#### `test-project.ts` — Temp Project Manager

```typescript
const project = await createTestProject({
  localDbUrl: db.url,
  remoteDbUrl: db.url,
  remoteName: "dev",
});
// project.rootDir, project.configPath, project.dbDir, project.schemaPath
```

Creates an isolated temp directory with `postkit.config.json`, `.postkit/db/` structure, and schema directories. Auto-cleaned in `afterAll`.

#### `test-database.ts` — Docker PostgreSQL

```typescript
const db = await startPostgres();           // Single container
const {local, remote} = await startPostgresPair();  // Two containers
```

Uses testcontainers to spin up `postgres:16-alpine` containers. Each test suite gets a fresh, isolated database.

#### `db-query.ts` — Database Verification

```typescript
await tableExists(db.url, "posts");        // boolean
await getTableRowCount(db.url, "posts");   // number
await executeSql(db.url, "CREATE TABLE…"); // void
```

Direct `pg` queries for verifying database state after CLI commands. Uses fresh connections per query.

#### `schema-builder.ts` — Schema File Scaffolding

```typescript
await writeTableSchema(project, "users", SIMPLE_TABLE_DDL);
await writeInfraFile(project, "extensions", SIMPLE_INFRA_SQL);
await writeSeedFile(project, "initial_data", SIMPLE_SEED_SQL);
```

Creates SQL files in the correct schema subdirectories. Provides DDL templates (`SIMPLE_TABLE_DDL`, `SECOND_TABLE_DDL`, etc.).

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

## Running Tests

### Non-Docker Tests (fast, ~2s)

```bash
npx vitest run --config vitest.e2e.config.ts \
  test/e2e/smoke/ \
  test/e2e/error-handling/invalid-config.test.ts \
  test/e2e/error-handling/no-session.test.ts \
  test/e2e/workflows/remote-management.test.ts
```

### Docker Tests (requires Docker, ~30-60s)

```bash
# Make sure Docker is running first
npm run test:e2e
```

### Individual Workflows

```bash
npx vitest run --config vitest.e2e.config.ts test/e2e/workflows/happy-path.test.ts
npx vitest run --config vitest.e2e.config.ts test/e2e/workflows/deploy-workflow.test.ts
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
   import {executeSql, tableExists} from "../helpers/db-query";
   ```

3. Use `--force` flag on commands that have interactive prompts (`apply`, `commit`, `abort`, `migration`, `deploy`, `remote remove`). Note: `start` does not have `--force`.

4. Always clean up in `afterAll`:
   ```typescript
   afterAll(async () => {
     if (project) await cleanupTestProject(project);
     if (db) await stopPostgres(db);
   });
   ```

5. Run: `npm run test:e2e`
