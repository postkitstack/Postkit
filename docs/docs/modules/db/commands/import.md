---
sidebar_position: 13
---

# db import

Import an existing database into PostKit as a baseline migration. Use this command when onboarding a database that was not previously managed by PostKit.

## Usage

```bash
postkit db import [--url <url>] [--schemas <schemas>] [--name <name>]
```

## Options

| Option | Description |
|--------|-------------|
| `--url <url>` | Database URL to import from (default: `localDbUrl` from config) |
| `--schemas <string>` | Comma-separated list of schemas to import (default: all from config) |
| `--name <string>` | Label for the baseline migration (default: `imported_baseline`) |
| `-f, --force` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |
| `--dry-run` | Show what would be done without making changes |

## Examples

```bash
# Import from localDbUrl in config
postkit db import

# Import from a specific database
postkit db import --url "postgres://user:pass@host:5432/myapp"

# Import specific schemas
postkit db import --schemas "public,app" --name initial_baseline

# Import all schemas from config
postkit db import
```

## What It Does

1. **Prerequisites** — Verifies `pgschema` and `dbmate` are available and no active session exists
2. **Connection** — Connects to the target database and reports table count
3. **Confirmation** — Warns about existing schema/migration files (both directories will be **cleared and replaced**), prompts to proceed
4. **Schema dump** — Runs `pgschema dump --multi-file` into a temp directory (`.postkit/db/tmp-import/`), then adds numeric prefixes (`001_`, `002_`, etc.) to all SQL files based on the `\i` directive order in `schema.sql`
5. **Normalize** — Clears existing schema directory and maps the dump into PostKit's schema directory structure:
   - Object directories (`tables/`, `views/`, `functions/`, etc.) copied with numeric prefix ordering into `db/schema/<name>/<section>/`
   - Roles queried from `pg_roles` → written to `db/infra/001_roles.sql` using idempotent `DO $$ IF NOT EXISTS $$` blocks
   - Schemas queried from `pg_namespace` → written to `db/infra/002_schemas.sql` as `CREATE SCHEMA IF NOT EXISTS`
   - Extensions parsed from `schema.sql` → written to `extensions/imported_extensions.sql`
   - Privileges consolidated into `grants/<schema>.sql` (managed by pgschema)
   - **Updates `postkit.config.json`** — adds each imported schema name to the `db.schemas` array (idempotent)
6. **Baseline migration** — Clears existing migrations directory, runs `pgschema plan` against an empty temp database to generate full CREATE DDL, writes it to `.postkit/db/migrations/`, and updates `committed.json`
7. **Local setup** — Creates the local database, applies infrastructure SQL (roles, schemas), then applies the baseline migration via `dbmate`
8. **Sync migration state** — After successful local apply, inserts the baseline version into `schema_migrations` on the source database
9. **Cleanup** — Removes the temp import directory, plan file, and generated schema file

## Infra Extraction

Because `pgschema dump` does not emit `CREATE SCHEMA` or `CREATE ROLE` statements, PostKit queries the database directly:

**Roles** (`pg_catalog.pg_roles`) — written as idempotent blocks:

```sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END
$$;
```

**Schemas** (`pg_catalog.pg_namespace`):

```sql
CREATE SCHEMA IF NOT EXISTS myschema AUTHORIZATION myuser;
```

System roles (`pg_*`, `postgres`) and system schemas (`pg_*`, `information_schema`) are excluded.

## End State

| Location | Content |
|----------|---------|
| `db/schema/<name>/` | Normalized schema files with numeric prefix ordering (e.g. `001_users.sql`, `002_posts.sql`) |
| `db/infra/001_roles.sql` | Extracted roles (idempotent `DO $$ ... $$` blocks) |
| `db/infra/002_schemas.sql` | Extracted `CREATE SCHEMA IF NOT EXISTS` statements |
| `postkit.config.json` | `db.schemas` array updated with all imported schema names |
| `.postkit/db/migrations/` | Baseline migration SQL file |
| `.postkit/db/committed.json` | Tracking entry for the baseline migration (`deployed: false`) |
| Source database | `schema_migrations` row for the baseline version |
| Local database | Fully set up with imported schema |

### Imported Schema Directory Structure

After import, the schema directory is populated from the database dump:

```
db/
├── infra/
│   ├── roles.sql                          # Idempotent CREATE ROLE statements
│   └── schemas.sql                        # CREATE SCHEMA IF NOT EXISTS statements
└── schema/
    └── public/
        ├── functions/
        │   ├── 001_function_a.sql         # Numeric prefix from pgschema dump order
        │   └── 002_function_b.sql
        ├── tables/
        │   ├── 001_app_config.sql
        │   ├── 002_app_user.sql
        │   ├── 003_client_org.sql
        │   └── ...
        ├── views/
        │   └── 001_user_stats.sql
        ├── materialized_views/
        │   └── 001_dashboard_summary.sql
        ├── grants/                        # Managed by pgschema
        │   └── public.sql                 # Consolidated privileges
        └── .pgschemaignore                # Excludes schema_migrations table
```

## Next Steps

After a successful import:

```bash
# 1. Review the generated schema files
# 2. Add a remote pointing to your target database
postkit db remote add production "postgres://..."

# 3. Start the normal workflow
postkit db start
# edit schema files...
postkit db plan
```

## Related

- [`start`](/docs/modules/db/commands/start) - Start a migration session
- [`remote`](/docs/modules/db/commands/remote) - Manage remote databases
- [`infra`](/docs/modules/db/commands/infra) - Apply infrastructure SQL
