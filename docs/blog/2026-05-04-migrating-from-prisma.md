---
slug: migrating-from-prisma-migrate-to-postkit
title: "From Prisma Migrate to PostKit: Taking Back Your SQL"
authors: [postkit_team]
tags: [migration, prisma, postgres, workflow]
image: /img/blog/prisma-to-postkit.jpg
---

Prisma is an excellent ORM and Prisma Migrate is a good solution for teams that want to stay in TypeScript and never write SQL. But some teams reach a point where they want direct SQL control — complex views, functions, triggers, RLS policies, custom indexes. Prisma Migrate's model makes these awkward. PostKit is built for exactly that use case.

<!-- truncate -->

## When Prisma Migrate Stops Scaling

Prisma Migrate works by translating your `schema.prisma` model into SQL migrations. This is great until you need:

- **PostgreSQL views** — not supported natively in `schema.prisma`
- **RLS policies** — not expressible in Prisma schema
- **Custom functions and triggers** — require raw SQL blocks in Prisma with `db.execute`
- **Multi-schema projects** — Prisma has limited multi-schema support and it varies by database connector
- **Complex index types** — GIN, BRIN, partial indexes require `@@index` raw map or custom SQL

Teams usually end up with a hybrid: Prisma Migrate for tables, a separate folder of raw SQL files for everything else. PostKit unifies these under one workflow.

---

## What the Migration Looks Like

The transition has two phases: getting your current schema into PostKit, then switching your ongoing workflow.

### Phase 1: Import your existing database

PostKit's `db import` command reads your current PostgreSQL database (not your `schema.prisma`) and generates schema files:

```bash
npm install -g @appritech/postkit
postkit init

# Add your database as a remote
postkit db remote add dev "postgres://..." --default

# Import the current schema
postkit db import --url "postgres://..."
```

This creates `db/schema/public/` with all your current tables, views, functions, and constraints organized into subdirectories. Your Prisma-managed tables appear as plain SQL files — PostKit doesn't know or care how they were created.

### Phase 2: Stop running `prisma migrate`

From this point forward:

- Schema changes go in `db/schema/<name>/` files
- `postkit db plan` generates the SQL diff
- `postkit db apply` → `postkit db commit` → `postkit db deploy` replaces `prisma migrate dev` / `prisma migrate deploy`

You can keep using Prisma as your ORM (queries, type generation, `prisma generate`). Just stop using `prisma migrate`.

---

## Side-by-Side Comparison

| Task | Prisma Migrate | PostKit |
|------|---------------|---------|
| Add a column | Edit `schema.prisma`, run `prisma migrate dev` | Edit the table SQL file, run `postkit db plan && postkit db apply` |
| Add an index | Edit `schema.prisma` | Add to `db/schema/<name>/indexes/` |
| Create a view | Raw `db.execute()` in a migration | File in `db/schema/<name>/views/` |
| Add RLS policy | Custom SQL in migration | File in `db/schema/<name>/policies/` (pgschema-managed) |
| Create a function | Custom SQL migration | File in `db/schema/<name>/functions/` |
| Deploy to production | `prisma migrate deploy` | `postkit db deploy` (with dry-run) |
| Inspect current schema | Read `schema.prisma` | Read `db/schema/<name>/tables/*.sql` |

---

## Keeping Prisma for Queries

PostKit manages your schema; Prisma manages your application queries. These don't conflict. Your workflow becomes:

```bash
# Schema change:
# 1. Edit db/schema/public/tables/users.sql
postkit db plan
postkit db apply

# 2. Regenerate Prisma client to pick up the new column:
npx prisma db pull  # update schema.prisma from DB
npx prisma generate # regenerate client
```

`prisma db pull` reads the current database schema into `schema.prisma`, which you then commit alongside the PostKit schema file changes. PostKit owns the source of truth; Prisma reads it.

---

## What About Existing Prisma Migrations?

You don't need to port them. `postkit db import` creates a single baseline from the current database state — all prior migration history (Prisma or otherwise) is collapsed into that baseline. PostKit only cares about the current state and future changes.

Your existing `prisma/migrations/` folder can stay in your repo as historical reference or be removed — PostKit doesn't interact with it.

---

## The Practical Transition Checklist

- [ ] Run `postkit init` in your project root
- [ ] Add your remote database: `postkit db remote add dev "postgres://..."`
- [ ] Run `postkit db import --url "postgres://..."` to generate `db/schema/`
- [ ] Review generated files — especially `db/infra/` for roles and extensions
- [ ] Add `prisma/migrations/` to your "no longer needed" list (keep for history, stop running)
- [ ] On schema changes: edit `db/schema/` → `postkit db plan` → `postkit db apply`
- [ ] After schema changes: `npx prisma db pull && npx prisma generate` to update the Prisma client
- [ ] On deploy: `postkit db commit && postkit db deploy`

---

If you're running a pure SQL application (PostgREST, raw `pg` queries), skip the Prisma steps entirely — PostKit stands alone.
