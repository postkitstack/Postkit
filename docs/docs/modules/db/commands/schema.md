---
sidebar_position: 11
---

# db schema

Manage PostgreSQL schemas in your project.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| [`add`](#add) | Scaffold a new schema directory and register it in config |

---

## add

Scaffold a new schema, update `db/infra/` with a `CREATE SCHEMA` statement, and register the schema in `postkit.config.json`.

### Usage

```bash
postkit db schema add <name> [-f]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `<name>` | Schema name — lowercase letters, digits, and underscores only (e.g. `app`, `analytics_v2`) |

### Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Re-scaffold if the directory already exists |
| `--dry-run` | Show what would be done without writing any files |
| `-v, --verbose` | Enable verbose output |

### Examples

```bash
# Add a new "app" schema
postkit db schema add app

# Add a schema even if the directory already exists
postkit db schema add app --force

# Preview what would be created without writing files
postkit db schema add analytics --dry-run
```

### What It Does

**Step 1 — Scaffold directories**

Creates `db/schema/<name>/` with 9 standard subdirectories:

```
db/schema/<name>/
├── tables/
├── views/
├── functions/
├── triggers/
├── types/
├── enums/
├── policies/
├── grants/
└── seeds/
```

These directories map directly to the section ordering used by `postkit db plan`. The `seeds/` directory is excluded from schema diffing and applied separately by `postkit db apply`.

**Step 2 — Update `db/infra/`**

Appends `CREATE SCHEMA IF NOT EXISTS "<name>";` to the most appropriate infra file:

1. Any existing file already containing a `CREATE SCHEMA` statement (e.g. after `db import` this is `002_schemas.sql`)
2. Any file with "schema" in its name
3. Creates `db/infra/schemas.sql` if no suitable file exists

The infra directory is applied before all schema DDL on every `apply` and `deploy`, so the schema namespace is always created before any objects are placed inside it.

**Step 3 — Update `postkit.config.json`**

Adds the schema name to the end of the `db.schemas` array:

```json
{
  "db": {
    "schemas": ["public", "app"]
  }
}
```

Array order determines execution order in `postkit db plan`. Schemas that others depend on must appear first. Run `schema add` in dependency order.

### Name Validation

Schema names must match `[a-z_][a-z0-9_]*`:

| Valid | Invalid |
|-------|---------|
| `app` | `App` (uppercase) |
| `my_schema` | `my-schema` (hyphen) |
| `analytics_v2` | `2analytics` (leading digit) |
| `_internal` | `my schema` (space) |

### Next Steps

After adding a schema:

```bash
# 1. Add SQL files to the new schema directory
#    e.g. db/schema/app/tables/orders.sql

# 2. Create the schema in your local database
postkit db infra --apply

# 3. Generate a migration diff
postkit db plan

# 4. Apply and commit as usual
postkit db apply
postkit db commit
postkit db deploy
```

### Related

- [`infra`](/docs/modules/db/commands/infra) — Apply infrastructure SQL (including CREATE SCHEMA)
- [`plan`](/docs/modules/db/commands/plan) — Generate schema diff across all schemas
- [DB Module Overview](/docs/modules/db/overview#schema-directory-structure) — How multiple schemas work together
