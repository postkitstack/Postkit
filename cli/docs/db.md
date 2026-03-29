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
│   │    on local DB   │            │ 10. Apply grants │                       │
│   │ 10. Apply grants │            │ 11. Apply seeds  │                       │
│   │ 11. Apply seeds  │            └────────┬─────────┘                       │
│   └────────┬─────────┘                     │                                 │
│            │                               ▼                                 │
│   $ postkit db commit                                                        │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 12. Apply infra  │            │ 13. Copy staging │                       │
│   │     to remote    │───────────►│     migrations   │                       │
│   │                  │            │ 14. Run dbmate   │                       │
│   │                  │            │     on remote DB  │                       │
│   │                  │            │ 15. Apply grants │                       │
│   │                  │            │ 16. Apply seeds  │                       │
│   └──────────────────┘            └──────────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧰 Prerequisites

- **PostgreSQL** client tools (`pg_dump`, `psql`)
- **pgschema** — Schema diffing tool ([installation guide](https://github.com/pgschema/pgschema))
- **dbmate** — Database migration tool
  ```bash
  # macOS
  brew install dbmate

  # Go
  go install github.com/amacneil/dbmate@latest
  ```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `REMOTE_DATABASE_URL` | PostgreSQL connection URL for remote/production database | Yes |
| `LOCAL_DATABASE_URL` | PostgreSQL connection URL for local clone database | Yes |
| `SCHEMA_PATH` | Path to schema files (relative to CLI root) | No |
| `MIGRATIONS_PATH` | Path to migrations directory | No |
| `PGSCHEMA_BIN` | Path to pgschema binary | No (default: `pgschema`) |
| `DBMATE_BIN` | Path to dbmate binary | No (default: `dbmate`) |

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
├── functions/
│   └── helpers.sql
├── triggers/
│   └── updated_at.sql
├── indexes/
│   └── performance.sql
├── grants/                   # Post-migration grant statements
│   └── app_user.sql
└── seeds/                    # Post-migration seed data
    └── default_roles.sql
```

**Execution ordering:** infra (pre-migration) → pgschema-managed schema (extensions → types → enums → domains → sequences → tables → views → functions → triggers → indexes → constraints → policies) → grants (post-migration) → seeds (post-migration)

**Note:** `infra/`, `grants/`, and `seeds/` directories are excluded from pgschema processing and handled as separate steps.

---

## 🚀 Commands

### `postkit db start`

Clone the remote database to local and initialize a migration session.

```bash
postkit db start
```

**What it does:**
1. Checks prerequisites (pgschema, dbmate installed)
2. Tests connection to remote database
3. Clones remote database to local using `pg_dump` and `psql`
4. Creates a session file (`.session.json`) to track state

---

### `postkit db plan`

Generate a schema diff showing what changes will be applied.

```bash
postkit db plan
```

**What it does:**
1. Combines all schema files from `db/schema/` into a single SQL file (excluding `infra/`, `grants/`, `seeds/`)
2. Runs `pgschema plan` to compare against local database
3. Saves a schema fingerprint (SHA-256 hash of source files) for validation during apply
4. Displays the migration plan and saves to `.plan.sql`

---

### `postkit db apply`

Apply the planned schema changes to the local cloned database. Creates a dbmate migration file and runs it locally.

```bash
postkit db apply
postkit db apply -f          # Skip confirmation
```

**What it does:**
1. Validates schema fingerprint (ensures schema files haven't changed since plan)
2. Displays the planned changes and asks for a migration description
3. Tests local database connection
4. Applies infrastructure SQL from `db/schema/infra/`
5. Wraps the plan SQL and creates a dbmate migration file (staged in `.postkit/migrations/`)
6. Runs `dbmate migrate` on the local database
7. Applies grant statements from `db/schema/grants/`
8. Applies seed data from `db/schema/seeds/`

**Resume support:** If grants or seeds fail, re-running `postkit db apply` resumes from where it left off (the migration is not re-applied).

---

### `postkit db commit`

Apply the staged migration to the remote database.

```bash
postkit db commit
postkit db commit -f         # Skip confirmation
```

**What it does:**
1. Tests remote database connection
2. Applies infrastructure SQL from `db/schema/infra/` to remote
3. Copies staged migration files from `.postkit/migrations/` to `db/migrations/`
4. Runs `dbmate migrate` on the remote database
5. Applies grant statements to remote
6. Applies seed data to remote
7. Cleans up session files

**Resume support:** If the commit fails partway through, re-running `postkit db commit` resumes from where it left off. The commit state tracks which steps have completed.

---

### `postkit db deploy`

Deploy committed migrations to a target environment (staging, production). Performs a full dry-run verification on a local clone before touching the target.

```bash
postkit db deploy --target=staging           # Use URL from config environments
postkit db deploy --target=production        # Use URL from config environments
postkit db deploy --url=postgres://...       # Direct URL override
postkit db deploy --target=staging -f        # Skip confirmations
```

**What it does:**
1. Resolves the target database URL (from `--target` config lookup or `--url` flag)
2. If an active session exists, removes it (with confirmation unless `-f`)
3. Tests the target database connection
4. Clones the target database to local (using `LOCAL_DATABASE_URL`)
5. Runs a full dry-run on the local clone: infra, dbmate migrate, grants, seeds
6. Reports dry-run results and confirms deployment (unless `-f`)
7. Applies to target: infra, dbmate migrate, grants, seeds
8. Drops the local clone database
9. Reports success

**Configuration:**

Add environments to `postkit.config.json`:

```json
{
  "db": {
    "remoteDbUrl": "postgres://user:pass@dev-host:5432/myapp",
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "environments": {
      "staging": "postgres://user:pass@staging-host:5432/myapp",
      "production": "postgres://user:pass@prod-host:5432/myapp"
    }
  }
}
```

If the dry run fails, deployment is aborted and no changes are made to the target database.

---

### `postkit db status`

Show the current session state and pending changes.

```bash
postkit db status
```

---

### `postkit db abort`

Cancel the current session and clean up all local resources.

```bash
postkit db abort
postkit db abort -f          # Skip confirmation
```

---

### `postkit db infra`

Manage infrastructure SQL (roles, schemas, extensions) from `db/schema/infra/`.

```bash
postkit db infra                          # Show infra statements
postkit db infra --apply                  # Apply to local
postkit db infra --apply --target=remote  # Apply to remote
```

---

### `postkit db grants`

Regenerate and display grant statements from `db/schema/grants/`.

```bash
postkit db grants                         # Show grants
postkit db grants --apply                 # Apply to local
postkit db grants --apply --target=remote # Apply to remote
```

---

### `postkit db seed`

Manage seed data from `db/schema/seeds/`.

```bash
postkit db seed                           # Show seed statements
postkit db seed --apply                   # Apply to local
postkit db seed --apply --target=remote   # Apply to remote
```

---

## 📋 Typical Workflow

```bash
# 1. Start a session (clones remote DB locally)
postkit db start

# 2. Edit schema files in db/schema/
#    e.g., add a column to db/schema/tables/users.sql

# 3. Preview changes
postkit db plan

# 4. Test on local clone (asks for migration description, creates migration file)
postkit db apply

# 5. (Optional) Make more changes and repeat plan → apply

# 6. Commit to remote when ready
postkit db commit

# If something goes wrong:
postkit db abort
```

---

## 🔧 Session State

Session state is stored in `.postkit/session.json`:

```json
{
  "active": true,
  "startedAt": "2026-02-11T12:00:00Z",
  "remoteSnapshot": "20260211120000",
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
    "grantsApplied": false,
    "seedsApplied": false
  }
}
```

Migration files are staged in `.postkit/migrations/` during the session and copied to `db/migrations/` on commit.

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `pgschema is not installed` | Install from [pgschema repo](https://github.com/pgschema/pgschema) |
| `dbmate is not installed` | `brew install dbmate` or `go install github.com/amacneil/dbmate@latest` |
| `Failed to connect to remote database` | Check `REMOTE_DATABASE_URL` in `.env` |
| `No active migration session` | Run `postkit db start` first |
| `Plan file is empty` | Schema files match current DB — make changes first |
| `Schema files have changed since the plan was generated` | Schema files were modified after running `plan`. Run `postkit db plan` again |
| `Grants/seeds failed during apply` | Re-run `postkit db apply` — it resumes from where it left off |
| `Commit failed partway through` | Re-run `postkit db commit` — it resumes from where it left off |
