---
sidebar_position: 2
---

# Project Structure

## User Project Structure

```
my-project/
├── db/                       # User's database code (git tracked)
│   ├── infra/                # DB-level: roles, extensions, CREATE SCHEMA
│   │   ├── 001_roles.sql
│   │   ├── 002_extensions.sql
│   │   └── 003_schemas.sql
│   └── schema/               # Per-schema SQL files
│       ├── public/           # Schema: "public"
│       │   ├── tables/
│       │   │   ├── 001_users.sql
│       │   │   └── ...
│       │   ├── views/
│       │   ├── functions/
│       │   ├── triggers/
│       │   ├── types/
│       │   ├── enums/
│       │   ├── grants/
│       │   └── seeds/
│       └── app/              # Schema: "app" (optional)
│           ├── tables/
│           └── seeds/
├── .postkit/                 # PostKit runtime (gitignored)
│   ├── db/                   # All DB runtime files
│   │   ├── session.json      # Session state
│   │   ├── committed.json    # Committed migrations tracking
│   │   ├── plan_public.sql   # Generated plan per schema
│   │   ├── plan_app.sql
│   │   ├── schema_public.sql # Generated schema artifact per schema
│   │   ├── schema_app.sql
│   │   ├── session/          # Session migrations (temporary)
│   │   └── migrations/       # Committed migrations (for deploy)
│   │       └── 00000000000001_create_storage_migrations_table.sql  # scaffolded by init
│   └── auth/                 # Auth module runtime files
│       ├── raw/              # Raw exports from source Keycloak
│       │   └── {realm}.json
│       ├── realm/            # Cleaned configs for import
│       │   └── {realm}.json
│       └── providers/        # Keycloak provider JARs (gitignored, rebuilt by init)
├── postkit.config.json       # Project configuration
├── .env                      # Environment variables (gitignored)
└── package.json
```

## Schema Directory

The `db/` directory is organized into infrastructure and per-schema sections:

### Infrastructure (Handled Separately)

| Directory | Description | Processed By |
|-----------|-------------|--------------|
| `db/infra/` | DB-level: roles, extensions, CREATE SCHEMA | Applied separately (excluded from pgschema) |

> ⚠️ **Only roles, schemas, and extensions belong in `db/infra/` — never tables, views, functions, or other pgschema-managed objects.** `postkit db start`/`db deploy` apply `db/infra/` to the local database *before* cloning, so RLS policies and grants that reference custom roles restore correctly. A table defined in `db/infra/` would already exist locally by the time the clone tries to create it, causing the clone to fail.

### Schema Objects (Processed by `postkit db plan`)

Each schema has its own subdirectory under `db/schema/<name>/`:

| Directory | Description | Supported by pgschema |
|-----------|-------------|---------------------|
| `db/schema/<name>/types/` | Custom types | ✅ Yes |
| `db/schema/<name>/enums/` | ENUM types | ✅ Yes |
| `db/schema/<name>/tables/` | Table definitions | ✅ Yes |
| `db/schema/<name>/views/` | View definitions | ✅ Yes |
| `db/schema/<name>/functions/` | Function definitions | ✅ Yes |
| `db/schema/<name>/triggers/` | Trigger definitions | ✅ Yes |
| `db/schema/<name>/indexes/` | Index definitions | ✅ Yes |

### Post-Migration (Handled Separately)

| Directory | Description | Processed By |
|-----------|-------------|--------------|
| `db/schema/<name>/grants/` | Grant statements | Managed by pgschema |
| `db/schema/<name>/seeds/` | Seed data | Applied separately |

**Note:** Cluster and database level commands (CREATE DATABASE, CREATE ROLE, CREATE EXTENSION, etc.) are not supported by pgschema. Use `db/infra/` or manual migrations instead.

## PostKit Runtime Directory

`.postkit/` is split between gitignored (ephemeral) and committed (shared with the team) files:

### Database Module (`db/`)

| File/Directory | Tracked? | Description |
|----------------|----------|-------------|
| `session.json` | Gitignored | Current session state |
| `committed.json` | Committed | Committed migrations tracking |
| `plan_<name>.sql` | Gitignored | Generated migration plan per schema (e.g. `plan_public.sql`, `plan_app.sql`) |
| `schema_<name>.sql` | Gitignored | Generated schema artifact per schema (e.g. `schema_public.sql`) |
| `session/` | Gitignored | Session migrations (temporary, cleared on commit) |
| `migrations/` | Committed | Committed migrations (for deployment), including the `storage.migrations` bootstrap migration scaffolded by `init` |

### Auth Module (`auth/`)

| File/Directory | Tracked? | Description |
|----------------|----------|-------------|
| `raw/{realm}.json` | Committed | Raw export from source Keycloak (includes IDs, secrets) |
| `realm/{realm}.json` | Committed | Cleaned config ready for import (IDs, secrets stripped) |
| `providers/` | Gitignored | Keycloak provider JARs (bundled + project), rebuilt by `init` |

## Config File

`postkit.config.json` in your project root (committed, non-sensitive settings only):

```json
{
  "db": {
    "infraPath": "db/infra",
    "schemaPath": "db/schema",
    "schemas": ["public"]
  }
}
```

Credentials and remote configurations belong in `postkit.secrets.json` (gitignored). See [Configuration](/docs/getting-started/configuration) for the full reference.

Run `postkit init` to create the `.postkit/` directory structure, or scope it to one module with `postkit init db`, `postkit init auth`, or `postkit init stack` — see the [Init Command reference](/docs/reference/init).
