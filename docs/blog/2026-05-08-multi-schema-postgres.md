---
slug: managing-multiple-postgres-schemas
title: "Managing Multiple PostgreSQL Schemas Without the Pain"
authors: [postkit_team]
tags: [schemas, postgres, multi-tenant, architecture]
image: /img/blog/multi-schema-postgres.jpg
---

PostgreSQL schemas are namespaces inside a single database. Most applications start with just `public` and never think about it again. But as applications grow — multi-tenant SaaS, microservices sharing a database, strict separation between application and audit data — you eventually want multiple schemas. And then the tooling usually falls apart.

PostKit handles multiple schemas natively, with a clear model for what goes where.

<!-- truncate -->

## Why Multiple Schemas?

Common reasons teams reach for multiple schemas:

- **Application vs. internal separation**: `public` for user-facing tables, `app` for internal/operational tables, `audit` for immutable audit logs
- **Feature namespacing**: each major domain gets its own schema to prevent table name collisions and enforce clear ownership
- **Permission isolation**: different roles can be granted access to different schemas with a single `GRANT USAGE ON SCHEMA`
- **Multi-tenant**: per-tenant schemas (advanced use case, not covered here)

---

## The Challenge: Tools That Think in One Schema

Most migration tools (Flyway, Liquibase, Prisma Migrate, plain dbmate) run a list of SQL files in order. They don't understand schema structure — they just execute. This works fine for `public`. It breaks when you have `public.users` and `app.orders` with a foreign key between them, because you have to manually manage the execution order across files.

PostKit's approach:

- **Each schema is planned independently** by pgschema (the diff engine)
- **Schemas execute in config order** — dependencies go earlier in the array
- **Cross-schema SQL** (FKs, views, triggers spanning two schemas) uses manual migrations applied after all schemas are set up

---

## Setup: Adding a Second Schema

### 1. Scaffold the directory

```bash
postkit db schema add app
```

This creates `db/schema/app/` with subdirectories for tables, views, functions, etc., and updates `postkit.config.json`:

```json
{
  "db": {
    "schemas": ["public", "app"],
    "infraPath": "db/infra",
    "schemaPath": "db/schema"
  }
}
```

Array order matters — `public` runs before `app`.

### 2. Add the schema creation to infra

PostKit's infra step handles DB-level objects that pgschema doesn't manage:

```sql
-- db/infra/002_schemas.sql
CREATE SCHEMA IF NOT EXISTS app;
```

### 3. Write schema files for the new schema

```sql
-- db/schema/app/tables/orders.sql
CREATE TABLE app.orders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Note: `user_id` is a plain UUID column here, not a foreign key to `public.users`. Cross-schema FKs require a different approach (below).

---

## How Planning Works with Multiple Schemas

When you run `postkit db plan`, PostKit processes schemas in config order:

```
1. Apply infra (CREATE SCHEMA app, CREATE ROLE ...) to local DB
2. Plan public schema:
   - pgschema compares db/schema/public/ against local DB
   - Generates plan_public.sql if changes exist
   - Intermediate apply: runs plan_public.sql on local DB
3. Plan app schema:
   - pgschema compares db/schema/app/ against local DB
   - public schema objects are now present (from step 2)
   - Generates plan_app.sql if changes exist
```

The intermediate apply in step 2 is what makes cross-schema resolution possible during the plan phase — `app` can reference tables from `public` via intra-session state, even though pgschema plans each schema in isolation.

---

## Cross-Schema Foreign Keys

Here's where developers get confused. pgschema plans each schema in an isolated environment. If you write this in `db/schema/app/tables/orders.sql`:

```sql
-- This will fail during plan:
REFERENCES public.users(id)  -- ❌ public.users doesn't exist in pgschema's isolated env
```

You'll get:
```
ERROR: relation "public.users" does not exist
```

**The correct approach**: keep the column as a plain UUID in the schema file, then add the constraint as a manual migration.

```bash
postkit db migration add_cross_schema_fks
```

```sql
-- migrate:up
ALTER TABLE app.orders
  ADD CONSTRAINT fk_orders_user
  FOREIGN KEY (user_id) REFERENCES public.users(id);

-- migrate:down
ALTER TABLE app.orders DROP CONSTRAINT IF EXISTS fk_orders_user;
```

Manual migrations run via dbmate after all schemas are applied — at that point, `public.users` exists and the FK works.

---

## What Belongs Where

| Object | Location | Managed by |
|--------|----------|------------|
| Tables, indexes, views within one schema | `db/schema/<name>/` | pgschema → dbmate |
| Roles, extensions, `CREATE SCHEMA` | `db/infra/` | Infra step (psql) |
| Cross-schema FK constraints | `postkit db migration` | dbmate (manual) |
| Cross-schema views, functions, triggers | `postkit db migration` | dbmate (manual) |
| Seed data | `db/schema/<name>/seeds/` | Seeds step |

---

## Importing an Existing Multi-Schema Database

If you already have a multi-schema database, import everything at once:

```bash
postkit db import --url "postgres://..." --schemas "public,app,audit"
```

PostKit dumps all three schemas, organizes them into subdirectories, and creates a single baseline migration covering all schemas.

---

## The Result

Once set up, the workflow is identical to single-schema projects:

```bash
postkit db start
# edit db/schema/public/ or db/schema/app/ files
postkit db plan    # shows diffs per schema
postkit db apply
postkit db commit
postkit db deploy
```

Each schema's changes are shown separately in the plan output, so you can review `public` and `app` changes independently before applying.
