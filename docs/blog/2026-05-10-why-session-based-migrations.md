---
slug: why-session-based-migrations
title: "Why We Clone the Database Before Every Migration"
authors: [postkit_team]
tags: [migrations, workflow, postgres, best-practices]
image: /img/blog/session-based-migrations.jpg
---

Most database migration tools work the same way: write some SQL, run it against the database, hope for the best. PostKit takes a different approach — before any migration runs, we clone the production database to a local copy and work against that. It sounds like extra overhead. In practice, it catches a category of bugs that no amount of unit testing can find.

![Why We Clone the Database Before Every Migration](/img/blog/session-based-migrations.jpg)

<!-- truncate -->

## The Problem with "Write and Pray"

Typical migration workflow:

1. Write an `ALTER TABLE` statement
2. Run it against staging
3. If staging looks okay, run it against production

The failure modes here are well-known:

- **Missing index on a large table**: migration takes 3 hours, locks the table, site goes down
- **Foreign key constraint violation**: existing data fails the new constraint, migration rolls back
- **Wrong column type cast**: `ALTER COLUMN foo TYPE integer USING foo::integer` fails because some rows have non-numeric values
- **Schema drift**: staging has been modified manually over time, production has a different column order or default value

These failures share a root cause: you didn't test the migration against a copy of the actual data.

---

## The Session-Based Approach

PostKit's model:

```
postkit db start   →  clone production data to local DB
postkit db plan    →  generate schema diff (pgschema)
postkit db apply   →  apply migration to local clone
postkit db commit  →  lock in the migration files
postkit db deploy  →  dry-run on fresh clone, then deploy to production
```

The key step is `start`. It uses `pg_dump` inside a version-matched Docker container to clone your remote database to a local PostgreSQL instance. This means:

- **Your apply runs against real data**, not an empty schema
- **Version mismatch is impossible**: the container image is selected to match your remote's major version
- **No surprises on deploy**: the migration has already run successfully on a copy of the exact database it will target

---

## The Dry-Run Step

Even with local testing, we run one more safety check during deploy: a fresh clone of the target database is spun up, the migration is applied there first, and only if it succeeds does PostKit apply to the real target.

```
deploy:
  1. Clone target DB to a new local container
  2. Run the migration on that clone
  3. If it fails → stop, report the error, touch nothing
  4. If it succeeds → apply to the real target
```

This catches the rare case where your local clone diverged from the target (e.g. someone else applied a manual change directly to staging).

---

## pgschema: Diff Instead of Write

PostKit uses [pgschema](https://pgschema.com) to generate migration SQL. Rather than writing `ALTER TABLE` statements by hand, you declare the desired state in SQL files:

```sql
-- db/schema/public/tables/users.sql
CREATE TABLE public.users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name  TEXT              -- added this
);
```

`postkit db plan` compares this file against the current database state and generates the minimal diff:

```sql
ALTER TABLE public.users ADD COLUMN name TEXT;
```

You don't write the migration — you write the schema. The tool figures out what needs to change.

---

## What This Workflow Prevents

| Problem | Traditional workflow | PostKit session workflow |
|---------|---------------------|--------------------------|
| Large table lock | Discovered in production | Discovered on local clone with real data |
| FK constraint on existing data | May pass on empty staging | Fails on apply against real data |
| Wrong type cast | Silent data loss | Error during local apply |
| Schema drift between envs | Silent until deploy fails | Caught by dry-run before deploy |
| Human-written `ALTER TABLE` bugs | Typos reach production | pgschema generates the SQL |

---

## The Trade-off

The session approach costs you the time to clone the database at the start. For a 10GB database, that can be 2–5 minutes. For most teams this is a worthwhile investment — the alternative is discovering production issues after deployment.

For databases where a full clone is impractical (100GB+), you can use a representative subset or a pre-existing local PostgreSQL instance by setting `localDbUrl` in `postkit.secrets.json`. PostKit then skips the clone and connects directly.

---

## Getting Started

```bash
npm install -g @postkitstack/postkit
postkit init
postkit db remote add prod "postgres://..." --default
postkit db start    # clone happens here
```

From there, edit your schema files and run `postkit db plan` to see what changes.
