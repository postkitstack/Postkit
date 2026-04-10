---
sidebar_position: 13
---

# db import

Import an existing database into PostKit as a baseline migration. Use this command when onboarding a database that was not previously managed by PostKit.

## Usage

```bash
postkit db import [--url <url>] [--schema <schema>] [--name <name>]
```

## Options

| Option | Description |
|--------|-------------|
| `--url <url>` | Database URL to import from (default: `localDbUrl` from config) |
| `--schema <string>` | PostgreSQL schema to import (default: `public`) |
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

# Import a non-public schema with a custom migration name
postkit db import --schema myschema --name initial_baseline
```

## What It Does

1. **Prerequisites** — Verifies `pgschema` and `dbmate` are available and no active session exists
2. **Connection** — Connects to the target database and reports table count
3. **Confirmation** — Warns about any existing schema/migration files that will be overwritten, then prompts to proceed
4. **Schema dump** — Runs `pgschema dump --multi-file` into a temp directory (`.postkit/db/tmp-import/`)
5. **Normalize** — Maps the dump into PostKit's schema directory structure:
   - Object directories (`tables/`, `views/`, `functions/`, etc.) copied directly
   - Roles queried from `pg_roles` → written to `infra/roles.sql` using idempotent `DO $$ IF NOT EXISTS $$` blocks
   - Schemas queried from `pg_namespace` → written to `infra/schemas.sql` as `CREATE SCHEMA IF NOT EXISTS`
   - Extensions parsed from `schema.sql` → written to `extensions/imported_extensions.sql`
   - Privileges consolidated into `grants/<schema>.sql`
6. **Baseline migration** — Runs `pgschema plan` against an empty temp database to generate full CREATE DDL, writes it to `.postkit/db/migrations/`
7. **Sync migration state** — Inserts the baseline version into `schema_migrations` on the source database so it is recognised as already applied
8. **Local setup** — Creates the local database and applies the baseline migration via `dbmate`
9. **Cleanup** — Removes the temp import directory

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
| `<schemaPath>/` | Normalized schema files from dump |
| `.postkit/db/migrations/` | Baseline migration SQL file |
| Source database | `schema_migrations` row for the baseline version |
| Local database | Fully set up with imported schema |

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
