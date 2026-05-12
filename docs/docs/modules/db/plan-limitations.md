---
sidebar_position: 17
---

# Plan Command Limitations

The `postkit db plan` command uses **pgschema** to generate schema diffs. Understanding what pgschema supports (and doesn't) will help you use the plan command effectively.

## How the Plan Command Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DB PLAN COMMAND WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   $ postkit db plan                                                         │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 1. Read schema    │            │ 2. Combine all    │                       │
│   │    files         │───────────►│    files into    │                       │
│   │                  │            │    schema.sql    │                       │
│   └──────────────────┘            └────────┬─────────┘                       │
│                                      │                                      │
│                             ┌────────▼─────────┐                              │
│                             │ 3. Run pgschema │                              │
│                             │    plan (diff)  │                              │
│                             └────────┬─────────┘                              │
│                                      │                                      │
│                             ┌────────▼─────────┐                              │
│                             │ 4. Compare with │                              │
│                             │    current DB    │                              │
│                             └────────┬─────────┘                              │
│                                      │                                      │
│                             ┌────────▼─────────┐                              │
│                             │ 5. Generate      │                              │
│                             │    migration     │                              │
│                             │    plan          │                              │
│                             └──────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## What pgschema DOES Support

Schema-level objects **within a schema** are fully supported:

| Object Type | Supported |
|-------------|-----------|
| Tables | `CREATE TABLE`, `ALTER TABLE` |
| Views | `CREATE VIEW`, `CREATE MATERIALIZED VIEW` |
| Functions | `CREATE FUNCTION` |
| Triggers | `CREATE TRIGGER` |
| Indexes | `CREATE INDEX`, `CREATE UNIQUE INDEX` |
| Constraints | `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `CHECK` |
| Enums | `CREATE TYPE ... AS ENUM` |
| Domains | `CREATE DOMAIN` |
| Sequences | `CREATE SEQUENCE` |

## What pgschema DOES NOT Support

`pgschema` does **not** support cluster and database level commands:

### Cluster Level (Not Supported)

| Command | Alternative |
|---------|-------------|
| `CREATE DATABASE` | Use `db/infra/` or manual migration |
| `CREATE ROLE` | Use `db/infra/` or manual migration |
| `CREATE TABLESPACE` | Use manual migration |
| `CREATE USER` | Use `db/infra/` or manual migration |

### Database Level (Not Supported)

| Command | Alternative |
|---------|-------------|
| `CREATE EXTENSION` | Use `db/infra/` or manual migration |
| `CREATE SCHEMA` | Use `db/infra/` or manual migration |
| `CREATE CAST` | Use manual migration |
| `CREATE COLLATION` | Use manual migration |
| `CREATE CONVERSION` | Use manual migration |
| `CREATE EVENT TRIGGER` | Use manual migration |
| `CREATE FOREIGN DATA WRAPPER` | Use manual migration |
| `CREATE LANGUAGE` | Use manual migration |
| `CREATE OPERATOR` | Use manual migration |
| `CREATE PUBLICATION` | Use manual migration |
| `CREATE SERVER` | Use manual migration |
| `CREATE SUBSCRIPTION` | Use manual migration |
| `CREATE TEXT SEARCH` | Use manual migration |
| `CREATE USER MAPPING` | Use manual migration |

### Other

- `RENAME` commands are not supported

## How to Handle Unsupported Commands

### Option 1: Infrastructure SQL (`db/infra/`)

Place cluster and database level commands in `db/infra/`. These are applied **before** the plan command runs:

```
db/infra/
├── 001_roles.sql        -- CREATE ROLE, CREATE USER
├── 002_schemas.sql      -- CREATE SCHEMA
└── 003_extensions.sql   -- CREATE EXTENSION
```

### Option 2: Manual Migrations

For one-off SQL operations, use `postkit db migration`:

```bash
# Create a manual migration
postkit db migration <name>

# Edit the generated file in .postkit/db/session/
# Add your SQL (e.g., CREATE EXTENSION, CREATE ROLE, etc.)

# Apply it
postkit db apply

# Commit it
postkit db commit
```

## Examples

### Creating Extensions

**Preferred — add to `db/infra/`:**

```sql
-- db/infra/003_extensions.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**Fallback — one-off manual migration:**

```bash
postkit db migration add_uuid_extension
```

```sql
-- migrate:up
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- migrate:down
DROP EXTENSION IF EXISTS "uuid-ossp";
```

### Creating Schemas

**Preferred — add to `db/infra/`:**

```sql
-- db/infra/002_schemas.sql
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS analytics;
```

Also update `db.schemas` in `postkit.config.json` so PostKit manages the schema's SQL files:

```json
{ "db": { "schemas": ["public", "audit", "analytics"] } }
```

**Fallback — one-off manual migration:**

```bash
postkit db migration create_custom_schemas
```

```sql
-- migrate:up
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS analytics;
-- migrate:down
DROP SCHEMA IF EXISTS audit;
DROP SCHEMA IF EXISTS analytics;
```

### Creating Roles

**Preferred — add to `db/infra/`:**

```sql
-- db/infra/001_roles.sql
CREATE ROLE app_read;
CREATE ROLE app_write;
CREATE ROLE app_admin;
GRANT app_read TO app_write;
GRANT app_write TO app_admin;
```

**Fallback — one-off manual migration:**

```bash
postkit db migration create_app_roles
```

```sql
-- migrate:up
CREATE ROLE app_read;
CREATE ROLE app_write;
CREATE ROLE app_admin;
GRANT app_read TO app_write;
GRANT app_write TO app_admin;
-- migrate:down
DROP ROLE IF EXISTS app_admin;
DROP ROLE IF EXISTS app_write;
DROP ROLE IF EXISTS app_read;
```

## Key Takeaway

> **The `plan` command uses pgschema, which only handles schema-level objects. For cluster/database level commands, use `db/infra/` or create manual migrations with `postkit db migration`.**

## Related

- [`postkit db plan`](/docs/modules/db/commands/plan) - Generate schema diff
- [`postkit db migration`](/docs/modules/db/commands/migration) - Create manual SQL migration
- [`postkit db infra`](/docs/modules/db/commands/infra) - Manage infrastructure SQL
- [pgschema documentation](https://www.pgschema.com)
