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
│   └────────┬─────────┘            └────────┬─────────┘                       │
│            │                               │                                 │
│            ▼                               ▼                                 │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ User modifies    │            │ Shows changes    │                       │
│   │ schema files     │            │ to apply         │                       │
│   │ (db/schema/*)    │            │                  │                       │
│   └──────────────────┘            └──────────────────┘                       │
│                                            │                                 │
│   $ postkit db apply                       ▼                                 │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 5. Apply changes │            │ 6. Validate on   │                       │
│   │    to local DB   │◄───────────│    cloned DB     │                       │
│   │    (pgschema)    │            │                  │                       │
│   └────────┬─────────┘            └──────────────────┘                       │
│            │                                                                 │
│            ▼                                                                 │
│   $ postkit db commit "description"                                          │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 7. Create dbmate │            │ 8. Apply to      │                       │
│   │    migration     │───────────►│    remote DB     │                       │
│   │    file          │            │    (dbmate)      │                       │
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
└── grants/
    └── app_user.sql
```

**Schema ordering:** extensions → types → enums → domains → sequences → tables → views → functions → triggers → indexes → constraints → policies → grants

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
1. Combines all schema files from `db/schema/` into a single SQL file
2. Runs `pgschema plan` to compare against local database
3. Displays the migration plan and saves to `.plan.sql`

---

### `postkit db apply`

Apply the planned schema changes to the local cloned database.

```bash
postkit db apply
postkit db apply -f          # Skip confirmation
```

---

### `postkit db commit <description>`

Create a migration file and apply changes to the remote database.

```bash
postkit db commit "add_user_email_verification"
postkit db commit "add_user_email_verification" -f   # Skip confirmation
```

**What it does:**
1. Creates a dbmate migration file in `db/migrations/`
2. Applies the migration to the remote database
3. Cleans up session files

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

### `postkit db grants`

Regenerate and display grant statements from schema files.

```bash
postkit db grants                         # Show grants
postkit db grants --apply                 # Apply to local
postkit db grants --apply --target=remote # Apply to remote
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

# 4. Test on local clone
postkit db apply

# 5. Commit to remote when ready
postkit db commit "add_email_verification_column"

# If something goes wrong:
postkit db abort
```

---

## 🔧 Session State

Session state is stored in `.session.json`:

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
    "planFile": null
  }
}
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `pgschema is not installed` | Install from [pgschema repo](https://github.com/pgschema/pgschema) |
| `dbmate is not installed` | `brew install dbmate` or `go install github.com/amacneil/dbmate@latest` |
| `Failed to connect to remote database` | Check `REMOTE_DATABASE_URL` in `.env` |
| `No active migration session` | Run `postkit db start` first |
| `Plan file is empty` | Schema files match current DB — make changes first |
