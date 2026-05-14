---
sidebar_position: 16
---

# Cross-Schema Migrations

When your project has multiple PostgreSQL schemas (e.g. `public` and `app`), some changes **cannot** go inside your schema files — specifically anything that references objects in a **different** schema. This page explains the limitation, what to avoid, and how to do it correctly using manual migrations.

---

## The Problem

PostKit uses **pgschema** to plan each schema separately. When pgschema analyses `db/schema/app/`, it creates an isolated temporary environment containing only the `app` schema objects. It has no knowledge of `public.product`, `public.category`, or any other schema.

This means if you write a cross-schema foreign key directly in your schema file:

```sql
-- db/schema/app/tables/order_item.sql
CREATE TABLE app.order_item (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.product(id)  -- ❌ will fail
);
```

Running `postkit db plan` will fail with:

```
ERROR: relation "public.product" does not exist
```

The same applies to cross-schema views, functions, and triggers.

---

## The Solution — Manual Migrations

Use `postkit db migration` to write the cross-schema SQL as a plain migration file. Manual migrations are applied directly by **dbmate** after all schemas have been created and populated, so every object is available.

---

## Step-by-Step Example

### Scenario

You have two schemas:
- `public` — contains `category` and `product` tables
- `app` — contains `orders` and `order_item` tables

`order_item` needs a FK to `public.product`, and you want a cross-schema view in `app`.

---

### Step 1 — Keep schema files free of cross-schema references

Write each table without the cross-schema FK. Use a plain UUID column for now:

```sql
-- db/schema/public/tables/product.sql
CREATE TABLE public.product (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name  VARCHAR(200) NOT NULL,
    price DOUBLE PRECISION NOT NULL CHECK (price >= 0)
);
```

```sql
-- db/schema/app/tables/order_item.sql
CREATE TABLE app.order_item (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,   -- ✅ plain column, no cross-schema FK here
    quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DOUBLE PRECISION NOT NULL CHECK (unit_price >= 0)
);
```

---

### Step 2 — Run the normal plan/apply flow

```bash
postkit db start
postkit db plan     # plans public schema, then app schema — both succeed
postkit db apply    # applies both schemas to local DB
```

Both schemas are now in the local database.

---

### Step 3 — Create a manual migration for cross-schema objects

```bash
postkit db migration add_cross_schema_constraints
```

PostKit creates `.postkit/db/session/<timestamp>_add_cross_schema_constraints.sql` and opens it. Fill in the `-- migrate:up` section:

```sql
-- migrate:up

-- FK: app.order_item.product_id → public.product.id
-- Added as a manual migration because pgschema cannot plan cross-schema references.
ALTER TABLE app.order_item
    ADD CONSTRAINT fk_order_item_product
    FOREIGN KEY (product_id)
    REFERENCES public.product(id)
    ON DELETE RESTRICT;

-- Cross-schema view: app.order_summary joins app + public tables
CREATE VIEW app.order_summary AS
SELECT
    oi.id,
    oi.order_id,
    p.name  AS product_name,
    p.price AS unit_price,
    oi.quantity,
    (p.price * oi.quantity) AS line_total
FROM app.order_item oi
JOIN public.product p ON p.id = oi.product_id;

-- migrate:down
DROP VIEW IF EXISTS app.order_summary;
ALTER TABLE app.order_item DROP CONSTRAINT IF EXISTS fk_order_item_product;
```

---

### Step 4 — Apply, commit, and deploy

```bash
# Apply the manual migration (dbmate runs it; all schemas are present)
postkit db apply

# Verify locally, then commit
postkit db commit --message "add cross-schema FK and order summary view"

# Deploy to remote
postkit db deploy
```

---

## What Belongs Where

| Change | Where to put it | Managed by |
|--------|-----------------|------------|
| Tables, indexes, types, enums **within one schema** | `db/schema/<name>/tables/` etc. | pgschema → dbmate |
| RLS policies, grants **within one schema** | `db/schema/<name>/policies/` etc. | pgschema → dbmate |
| `CREATE SCHEMA`, `CREATE ROLE`, `CREATE EXTENSION` | `db/infra/` | infra step (psql) |
| **Cross-schema FK constraints** | `postkit db migration` | dbmate only |
| **Cross-schema views, functions, triggers** | `postkit db migration` | dbmate only |

---

## Adding Cross-Schema Objects Later (After Baseline)

If your schemas are already deployed and you want to add a new cross-schema constraint or view in a future change:

```bash
postkit db start

# If you changed any schema files, run plan + apply first:
postkit db plan
postkit db apply

# Then add the cross-schema SQL as a manual migration:
postkit db migration add_product_fk_to_order_item
# Edit the file, then:
postkit db apply
postkit db commit --message "add product FK to order_item"
postkit db deploy
```

You can mix pgschema-managed changes and manual migrations in the same session — `postkit db apply` handles both in sequence.

---

## Common Errors

### `ERROR: relation "other_schema.table" does not exist` during plan

A schema file contains a cross-schema reference. Remove the FK from the schema file and add it as a manual migration instead.

### `warn Schema "public" has no directory — skipping`

The schema is listed in `db.schemas` in your config but `db/schema/public/` doesn't exist on disk yet. Either run `postkit db schema add public` to scaffold it, or remove `"public"` from `db.schemas` if you only use a custom schema.

---

## Related

- [`postkit db migration`](/docs/modules/db/commands/migration) — Create a manual SQL migration
- [`postkit db plan`](/docs/modules/db/commands/plan) — Generate schema diffs
- [Plan Command Limitations](/docs/modules/db/plan-limitations) — Full list of pgschema limitations
