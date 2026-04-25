---
name: postkit-schema
description: Work with PostKit schema files — understand the directory structure, add or modify tables, types, enums, functions, and manage infra, grants, and seeds. Use when editing files under db/schema/.
paths: db/schema/**
allowed-tools: Bash(postkit *)
---

# PostKit Schema File Management

Guide for working with PostKit schema files in `db/schema/`.

## Schema Directory Structure

```
db/schema/
├── infra/         — Roles, schemas, extensions (pre-migration)
├── extensions/    — PostgreSQL extensions
├── types/         — Custom composite types
├── enums/         — Enum types
├── tables/        — Table definitions (columns, constraints)
├── functions/     — Functions and stored procedures
├── triggers/      — Trigger definitions
├── views/         — View definitions
├── indexes/       — Index definitions
├── grants/        — GRANT statements (post-migration)
└── seeds/         — Seed data (post-migration)
```

## What pgschema Manages

The `pgschema` tool generates SQL from schema files and detects changes. It manages these directories:

- `extensions/`, `types/`, `enums/`, `tables/`, `functions/`, `triggers/`, `views/`, `indexes/`

These are **excluded** from pgschema and managed separately:
- `infra/` — Applied before migrations via `postkit db infra`
- `grants/` — Applied after migrations via `postkit db grants`
- `seeds/` — Applied after migrations via `postkit db seed`

## Adding a New Table

1. Create a SQL file in `db/schema/tables/` (e.g., `users.sql`):

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

2. After adding or modifying schema files, run the migration workflow:

```bash
postkit db plan    # See the generated diff
postkit db apply   # Apply to local DB
```

## Modifying an Existing Table

Edit the SQL file in `db/schema/tables/` directly. pgschema will detect the change and generate the appropriate `ALTER TABLE` statements.

For example, to add a column, update the `CREATE TABLE` statement:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- New column
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Working with Enums

Create a file in `db/schema/enums/` (e.g., `user_status.sql`):

```sql
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
```

## Working with Functions

Create a file in `db/schema/functions/` (e.g., `update_timestamp.sql`):

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Infrastructure (Roles, Schemas, Extensions)

These go in `db/schema/infra/` and are applied **before** migrations:

```bash
# View infra statements
postkit db infra

# Apply to local DB
postkit db infra --apply

# Apply to remote DB
postkit db infra --apply --target remote
```

## Grants

Grant statements go in `db/schema/grants/` and are applied **after** migrations:

```bash
# View grant statements
postkit db grants

# Apply to local DB
postkit db grants --apply
```

## Seed Data

Seed data goes in `db/schema/seeds/` and is applied **after** migrations:

```bash
# View seed statements
postkit db seed

# Apply to local DB
postkit db seed --apply
```

## Important Notes

- Schema files use `CREATE` statements (not `ALTER`). pgschema computes the diff automatically.
- File names should be descriptive (e.g., `users.sql`, `orders.sql`).
- Order matters within a directory — pgschema processes files alphabetically.
- After editing any schema file, always run `postkit db plan` to verify the generated diff before applying.
