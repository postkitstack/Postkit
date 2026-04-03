---
sidebar_position: 2
---

# Project Structure

## User Project Structure

```
my-project/
├── db/                       # User's database code (git tracked)
│   └── schema/               # Schema definitions
│       ├── infra/            # Roles, schemas, extensions
│       ├── extensions/
│       ├── types/
│       ├── enums/
│       ├── tables/
│       ├── views/
│       ├── functions/
│       ├── triggers/
│       ├── indexes/
│       ├── grants/           # Grant statements
│       └── seeds/            # Seed data
├── .postkit/                 # PostKit runtime (gitignored)
│   └── db/                   # All DB runtime files
│       ├── session.json      # Session state
│       ├── committed.json    # Committed migrations tracking
│       ├── plan.sql          # Generated plan
│       ├── schema.sql        # Generated schema
│       ├── session/          # Session migrations (temporary)
│       └── migrations/       # Committed migrations (for deploy)
├── postkit.config.json       # Project configuration
├── .env                      # Environment variables (gitignored)
└── package.json
```

## Schema Directory

The `db/schema/` directory is organized into three categories:

### Infrastructure (Handled Separately)

| Directory | Description | Processed By |
|-----------|-------------|--------------|
| `infra/` | Pre-migration: roles, schemas, extensions | Applied separately (excluded from pgschema) |

### Schema Objects (Processed by `postkit db plan`)

| Directory | Description | Supported by pgschema |
|-----------|-------------|---------------------|
| `types/` | Custom types | ✅ Yes |
| `enums/` | ENUM types | ✅ Yes |
| `tables/` | Table definitions | ✅ Yes |
| `views/` | View definitions | ✅ Yes |
| `functions/` | Function definitions | ✅ Yes |
| `triggers/` | Trigger definitions | ✅ Yes |
| `indexes/` | Index definitions | ✅ Yes |

### Post-Migration (Handled Separately)

| Directory | Description | Processed By |
|-----------|-------------|--------------|
| `grants/` | Grant statements | Applied separately |
| `seeds/` | Seed data | Applied separately |

**Note:** Cluster and database level commands (CREATE DATABASE, CREATE ROLE, CREATE EXTENSION, etc.) are not supported by pgschema. Use `db/schema/infra/` or manual migrations instead.

## PostKit Runtime Directory

The `.postkit/` directory contains runtime files that are **not** tracked by git:

| File/Directory | Description |
|----------------|-------------|
| `session.json` | Current session state |
| `committed.json` | Committed migrations tracking |
| `plan.sql` | Generated migration plan |
| `schema.sql` | Generated schema from files |
| `session/` | Session migrations (temporary, cleared on commit) |
| `migrations/` | Committed migrations (for deployment) |

## Config File

`postkit.config.json` in your project root:

```json
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "schemaPath": "db/schema",
    "schema": "public",
    "remotes": {
      "dev": {
        "url": "postgres://user:pass@host:5432/myapp",
        "default": true
      }
    }
  }
}
```
