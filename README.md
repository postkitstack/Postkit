# Migration CLI

A TypeScript CLI tool for streamlined, session-based database migration workflow. This tool provides a safe way to develop and test schema changes locally before applying them to production.

## Overview

The migration workflow follows these steps:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMLINED MIGRATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   $ migr start                    $ migr plan                                │
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
│   $ migr apply                             ▼                                 │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 5. Apply changes │            │ 6. Validate on   │                       │
│   │    to local DB   │◄───────────│    cloned DB     │                       │
│   │    (pgschema)    │            │                  │                       │
│   └────────┬─────────┘            └──────────────────┘                       │
│            │                                                                 │
│            ▼                                                                 │
│   $ migr commit "description"                                                │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 7. Create dbmate │            │ 8. Apply to      │                       │
│   │    migration     │───────────►│    remote DB     │                       │
│   │    file          │            │    (dbmate)      │                       │
│   └──────────────────┘            └──────────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

Before using this tool, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **PostgreSQL** client tools (`pg_dump`, `psql`)
- **pgschema** - Schema diffing tool ([installation guide](https://github.com/pgschema/pgschema))
- **dbmate** - Database migration tool
  ```bash
  # macOS
  brew install dbmate

  # Go
  go install github.com/amacneil/dbmate@latest
  ```

## Installation

1. Navigate to the migration-cli directory:
   ```bash
   cd db/tools/migration-cli
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Create your environment file:
   ```bash
   cp .env.example .env
   ```

5. Configure your database connections in `.env`:
   ```env
   REMOTE_DATABASE_URL=postgres://user:password@host:5432/dbname
   LOCAL_DATABASE_URL=postgres://user:password@localhost:5432/dbname_local
   ```

## Commands

### `migr start`

Clone the remote database to local and initialize a migration session.

```bash
npm run migr start
```

**What it does:**
1. Checks prerequisites (pgschema, dbmate installed)
2. Tests connection to remote database
3. Clones remote database to local using `pg_dump` and `psql`
4. Creates a session file (`.session.json`) to track state

**Options:**
- `--dry-run` - Show what would happen without making changes
- `--verbose` - Enable detailed output

---

### `migr plan`

Generate a schema diff showing what changes will be applied.

```bash
npm run migr plan
```

**What it does:**
1. Combines all schema files from `db/schema/` into a single SQL file
2. Runs `pgschema plan` to compare against local database
3. Displays the migration plan
4. Saves the plan to `.plan.sql`

**Output example:**
```sql
-- Migration Plan
ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT false;
CREATE INDEX idx_users_email ON users(email);
```

---

### `migr apply`

Apply the planned schema changes to the local cloned database.

```bash
npm run migr apply
```

**What it does:**
1. Loads the previously generated plan
2. Prompts for confirmation
3. Applies changes to the local database using `pgschema apply`
4. Updates session state

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--dry-run` - Show what would happen without applying

---

### `migr commit <description>`

Create a migration file and apply changes to the remote database.

```bash
npm run migr commit "add_user_email_verification"
```

**What it does:**
1. Creates a dbmate migration file in `db/migrations/`
2. Applies the migration to the remote database
3. Cleans up session files
4. Ends the migration session

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--dry-run` - Show what would happen without committing

**Migration file format:**
```sql
-- migrate:up
ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT false;

-- migrate:down
-- Add rollback SQL here if needed
```

---

### `migr status`

Show the current session state and pending changes.

```bash
npm run migr status
```

**Output includes:**
- Session information (start time, duration)
- Pending changes status (planned, applied)
- Database connection status
- Plan preview (first 20 lines)
- Suggested next steps

---

### `migr abort`

Cancel the current session and clean up all local resources.

```bash
npm run migr abort
```

**What it does:**
1. Removes the plan file
2. Removes generated schema file
3. Drops the local clone database
4. Deletes the session file

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--dry-run` - Show what would happen without aborting

---

### `migr grants`

Regenerate and display grant statements from schema files.

```bash
npm run migr grants
```

**Options:**
- `--apply` - Apply grants to database
- `--target <local|remote>` - Target database (default: local)

**Examples:**
```bash
# Show grants
npm run migr grants

# Apply to local database
npm run migr grants -- --apply

# Apply to remote database
npm run migr grants -- --apply --target=remote
```

## Global Options

These options can be used with any command:

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose/debug output |
| `--dry-run` | Show what would be done without making changes |
| `-V, --version` | Output version number |
| `-h, --help` | Display help for command |

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `REMOTE_DATABASE_URL` | PostgreSQL connection URL for remote/production database | Yes |
| `LOCAL_DATABASE_URL` | PostgreSQL connection URL for local clone database | Yes |
| `SCHEMA_PATH` | Path to schema files (relative to CLI root) | No (default: `../../schema`) |
| `MIGRATIONS_PATH` | Path to migrations directory | No (default: `../../migrations`) |
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

**Schema ordering:**
1. extensions
2. types
3. enums
4. domains
5. sequences
6. tables
7. views
8. functions
9. triggers
10. indexes
11. constraints
12. policies
13. grants

## Session State

The session state is stored in `.session.json`:

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

## Typical Workflow

### 1. Start a new migration session

```bash
npm run migr start
```

This clones your remote database locally for safe testing.

### 2. Make schema changes

Edit files in `db/schema/`:

```sql
-- db/schema/tables/users.sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN DEFAULT false,  -- New column
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. Preview changes

```bash
npm run migr plan
```

Review the generated SQL to ensure it matches your expectations.

### 4. Test locally

```bash
npm run migr apply
```

This applies changes to your local clone. Test your application against the local database.

### 5. Commit when ready

```bash
npm run migr commit "add_email_verification_column"
```

This creates a migration file and applies it to the remote database.

### If something goes wrong

```bash
npm run migr abort
```

This cancels the session and cleans up all local changes.

## Global Installation (Optional)

To use `migr` as a global command:

```bash
npm link
```

Then you can run commands directly:

```bash
migr start
migr plan
migr apply
migr commit "description"
```

## Troubleshooting

### "pgschema is not installed"

Install pgschema following the instructions at [pgschema repository](https://github.com/pgschema/pgschema).

### "dbmate is not installed"

Install dbmate:
```bash
# macOS
brew install dbmate

# Go
go install github.com/amacneil/dbmate@latest
```

### "Failed to connect to remote database"

Check your `REMOTE_DATABASE_URL` in `.env`:
- Ensure the host is accessible
- Verify credentials are correct
- Check if the database exists

### "No active migration session"

Run `npm run migr start` to begin a new session before running other commands.

### "Plan file is empty"

Your schema files match the current database state. Make changes to `db/schema/` files first.

## Development

### Running in development mode

```bash
npm run dev -- <command>
# Example: npm run dev -- status
```

### Building

```bash
npm run build
```

### Project structure

```
src/
├── index.ts              # CLI entry point (commander)
├── commands/             # Command handlers
├── services/             # Core business logic
├── utils/                # Utility functions
└── types/                # TypeScript interfaces
```

## License

ISC
