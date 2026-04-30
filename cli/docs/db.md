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

- **PostgreSQL** client tools (`pg_dump`, `psql`)
- **pgschema** — Bundled with PostKit. Platform-specific binaries are shipped in `vendor/pgschema/` and resolved automatically. No separate installation needed.
- **dbmate** — Installed automatically as an npm dependency. No separate installation needed.

---

## ⚙️ Configuration

### Config File (`postkit.config.json`)

| Property | Description | Required |
|----------|-------------|----------|
| `db.localDbUrl` | PostgreSQL connection URL for local clone database | Yes |
| `db.schemaPath` | Path to schema files (relative to project root) | No |
| `db.schema` | Database schema name | No |
| `db.pgSchemaBin` | Path to pgschema binary | No |
| `db.dbmateBin` | Path to dbmate binary | No |
| `db.remotes` | Named remote database configurations | Yes (at least one) |

### Remote Configuration

Configure named remotes in `postkit.config.json`:

```json
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "schemaPath": "schema",
    "schema": "public",
    "remotes": {
      "dev": {
        "url": "postgres://user:pass@dev-host:5432/myapp",
        "default": true,
        "addedAt": "2024-12-31T10:00:00.000Z"
      },
      "staging": {
        "url": "postgres://user:pass@staging-host:5432/myapp"
      },
      "production": {
        "url": "postgres://user:pass@prod-host:5432/myapp"
      }
    }
  }
}
```

**Properties:**
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

The tool expects schema files organized in `db/schema/`:

```
db/schema/
├── infra/                    # Pre-migration infrastructure (roles, schemas, extensions)
│   ├── 001_roles.sql
│   ├── 002_schemas.sql
│   └── 003_extensions.sql
├── extensions/
│   └── uuid.sql
├── types/
│   └── custom_types.sql
├── enums/
│   └── status_enum.sql
├── tables/
│   ├── users.sql
│   ├── posts.sql
│   └── comments.sql
├── views/
│   └── user_stats.sql
├── materialized_views/
│   └── dashboard_summary.sql
├── functions/
│   └── helpers.sql
├── triggers/
│   └── updated_at.sql
├── indexes/
│   └── performance.sql
├── grants/                   # Grant statements (managed by pgschema)
│   └── app_user.sql
└── seeds/                    # Post-migration seed data
    └── default_roles.sql
```

**Execution ordering:** infra (pre-migration) → pgschema-managed schema (extensions → types → enums → domains → sequences → tables → views → materialized_views → functions → triggers → indexes → constraints → policies → grants) → seeds (post-migration)

**Note:** `infra/` and `seeds/` directories are excluded from pgschema processing and handled as separate steps. `grants/` is managed by pgschema.

### PostKit Directory Structure

All PostKit runtime files are stored in `.postkit/` (gitignored):

```
.postkit/
└── db/
    ├── session.json         # Current session state
    ├── committed.json       # Committed migrations tracking
    ├── plan.sql             # Generated migration plan
    ├── schema.sql           # Generated schema from files
    ├── session/             # Session migrations (temporary)
    │   └── 20250131_*.sql
    └── migrations/          # Committed migrations (for deploy)
        ├── 20250130_add_users.sql
        └── 20250131_add_posts.sql
```

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
3. Checks for pending committed migrations by querying the remote's `postkit.schema_migrations` table
4. Tests connection to remote database
5. Clones remote database to local using `pg_dump` and `psql`
6. Creates a session file (`.postkit/db/session.json`) to track state

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
4. Tests the target database connection
5. Clones the target database to local (using `LOCAL_DATABASE_URL`)
6. Runs a full dry-run on the local clone: infra, dbmate migrate, seeds
7. If `--dry-run` is set, stops here and reports results without touching the target
8. Reports dry-run results and confirms deployment (unless `-f`)
9. Applies to target: infra, dbmate migrate, seeds
10. Drops the local clone database

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

### `postkit db import [--url <url>] [--schema <schema>] [--name <name>]`

Import an existing database into PostKit as a baseline migration. Use when onboarding a database not previously managed by PostKit.

```bash
postkit db import                                          # Import from localDbUrl in config
postkit db import --url "postgres://user:pass@host/myapp" # Import from specific URL
postkit db import --schema myschema --name initial_baseline
```

**What it does:**
1. Checks prerequisites (pgschema, dbmate, no active session)
2. Connects to target database, reports table count
3. Warns about existing schema/migration files (both directories will be **cleared and replaced**), prompts confirmation
4. Runs `pgschema dump --multi-file` into a temp directory
5. Clears existing schema directory and resets `committed.json`, then normalizes dump into PostKit schema directory structure:
   - Roles queried directly from `pg_roles` → `infra/001_roles.sql` (idempotent `DO $$ IF NOT EXISTS $$`)
   - Schemas queried directly from `pg_namespace` → `infra/002_schemas.sql` (`CREATE SCHEMA IF NOT EXISTS`)
   - Extensions parsed from `schema.sql` → `extensions/imported_extensions.sql`
   - Privileges consolidated into `grants/<schema>.sql` (managed by pgschema)
   - All SQL files are prefixed with numeric ordering (`001_filename.sql`) based on `schema.sql` `\i` directives
6. Clears existing migrations directory and generates baseline DDL via `pgschema plan` against an empty temp database
7. For non-public schemas, prepends `SET search_path TO "<schema>"` to the baseline migration
8. Creates local database, applies infrastructure SQL (roles, schemas), then applies baseline migration via `dbmate`
9. After successful local apply, inserts baseline version into `postkit.schema_migrations` on the source database
10. Updates `committed.json` to track the baseline migration
11. Cleans up temp directory, plan file, and generated schema file

**Why roles/schemas are queried from DB directly:**
`pgschema dump` does not emit `CREATE SCHEMA` or `CREATE ROLE` statements. PostKit queries `pg_catalog.pg_namespace` and `pg_catalog.pg_roles` instead to reliably capture infra.

**Why infra SQL is applied before dbmate:**
The baseline migration contains `ALTER DEFAULT PRIVILEGES` and other statements that reference roles. These roles must exist in the local database before dbmate runs the migration. The infra SQL (from `schema/infra/`) is applied to the local database first to create those roles.

---

### `postkit db infra [--apply] [--target <local|remote>]`

Manage infrastructure SQL (roles, schemas, extensions) from `db/schema/infra/`.

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
  "localDbUrl": "postgres://...",
  "remoteDbUrl": "postgres://...",
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
| `Import: pgschema plan produced no output` | Schema directory may be empty after normalization. Check that the source DB has objects in the target schema. |
| `Import: Could not insert migration tracking record` | Non-fatal. The local DB migration succeeded but the source DB tracking record failed. Manually insert the version into `postkit.schema_migrations` on the source DB. |
| `Import: column does not exist during local apply` | Infrastructure SQL (roles, schemas) may not have been applied to the local database before dbmate. Ensure `schema/infra/` files exist and are valid. |
| `Import: relation does not exist during pgschema plan` | The `pgschema dump` ordering may not account for foreign key or policy dependencies. This is handled by pgschema internally. |
