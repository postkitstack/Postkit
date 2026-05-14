---
name: postkit-schema
description: Work with PostKit schema files — understand the directory structure, add or modify tables, types, enums, functions, manage infra, seeds, and multiple schemas. Use this skill whenever editing files under db/schema/ or db/infra/, creating or modifying SQL table definitions, adding columns, changing indexes, writing PostgreSQL functions or triggers, managing seeds, or adding a new PostgreSQL schema — even if the user doesn't mention PostKit explicitly.
paths: db/schema/**,db/infra/**
allowed-tools: Bash(postkit *)
---

# PostKit Schema File Management

Guide for working with PostKit schema files. PostKit supports multiple PostgreSQL schemas in a single project.

## Directory Structure

```
db/
├── infra/                  — DB-level objects (pre-migration, NOT pgschema-managed)
│   ├── 001_roles.sql       — CREATE ROLE, CREATE USER
│   ├── 002_schemas.sql     — CREATE SCHEMA
│   └── 003_extensions.sql  — CREATE EXTENSION
│
└── schema/
    └── <schema-name>/      — One directory per PostgreSQL schema (e.g. public, app)
        ├── types/              — Custom composite types
        ├── enums/              — ENUM types
        ├── tables/             — Table definitions
        ├── views/              — View definitions
        ├── materialized_views/ — Materialized views
        ├── functions/          — Functions and stored procedures
        ├── triggers/           — Trigger definitions
        ├── indexes/            — Index definitions
        ├── constraints/        — Additional constraints
        └── seeds/              — Seed data (post-migration)
```

## Adding a New PostgreSQL Schema

Use the scaffold command to create the directory structure and register it in config:

```bash
postkit db schema add <name>
```

For example:

```bash
postkit db schema add app
```

This creates `db/schema/app/` with all subdirectories, updates `db/infra/` with a `CREATE SCHEMA app;` statement, and adds `"app"` to the `schemas` array in `postkit.config.json`. Array order = execution order.

## What pgschema Manages

The `pgschema` tool generates SQL diffs from schema files. It manages these directories per schema:

- `types/`, `enums/`, `tables/`, `views/`, `materialized_views/`, `functions/`, `triggers/`, `indexes/`, `constraints/`

These are **excluded** from pgschema and managed separately:
- `db/infra/` — Applied before migrations via `postkit db infra`
- `db/schema/<name>/seeds/` — Applied after migrations via `postkit db seed`

## Adding a New Table

1. Create a SQL file in `db/schema/<name>/tables/` (e.g., `db/schema/public/tables/users.sql`):

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

2. Run the migration workflow:

```bash
postkit db plan    # See the generated diff
postkit db apply   # Apply to local DB
```

## Modifying an Existing Table

Edit the SQL file directly — pgschema detects the change and generates the appropriate `ALTER TABLE` statements automatically.

## Working with Enums

Create a file in `db/schema/<name>/enums/` (e.g., `db/schema/public/enums/user_status.sql`):

```sql
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
```

## Working with Functions

Create a file in `db/schema/<name>/functions/` (e.g., `db/schema/public/functions/update_timestamp.sql`):

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Cross-Schema References

When a table in one schema references another schema (e.g., `app.users`), PostKit handles this automatically during `postkit db plan` — it applies intermediate migrations between schemas so foreign key references resolve correctly.

## Infrastructure (Roles, Schemas, Extensions)

DB-level objects go in `db/infra/` and are applied **before** migrations:

```bash
# View infra statements
postkit db infra

# Apply to local DB
postkit db infra --apply

# Apply to remote DB
postkit db infra --apply --target remote
```

## Seed Data

Seed data goes in `db/schema/<name>/seeds/` and is applied **after** migrations:

```bash
# View seed statements
postkit db seed

# Apply to local DB
postkit db seed --apply

# Apply seeds for a specific schema only
postkit db seed --schema app --apply
```

## Important Notes

- Schema files use `CREATE` statements (not `ALTER`). pgschema computes the diff automatically.
- File names are sorted alphabetically within each directory — naming matters for dependency order.
- After editing any schema file, always run `postkit db plan` to verify the generated diff before applying.
- `db/infra/` is for cluster/database-level SQL only. Never put table or function definitions there.
