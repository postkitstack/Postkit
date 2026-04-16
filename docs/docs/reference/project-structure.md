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
│       │   ├── roles.sql
│       │   └── schemas.sql
│       ├── extensions/
│       ├── types/
│       ├── enums/
│       ├── tables/
│       │   ├── 001_app_config.sql    # Numeric prefix (from import)
│       │   ├── 002_app_user.sql
│       │   └── ...
│       ├── views/
│       ├── materialized_views/
│       ├── functions/
│       │   ├── 001_get_current_user.sql
│       │   └── ...
│       ├── triggers/
│       ├── indexes/
│       ├── grants/           # Grant statements
│       └── seeds/            # Seed data
├── .postkit/                 # PostKit runtime (gitignored)
│   ├── db/                   # All DB runtime files
│   │   ├── session.json      # Session state
│   │   ├── committed.json    # Committed migrations tracking
│   │   ├── plan.sql          # Generated plan
│   │   ├── schema.sql        # Generated schema
│   │   ├── session/          # Session migrations (temporary)
│   │   └── migrations/       # Committed migrations (for deploy)
│   └── auth/                 # Auth module runtime files
│       ├── raw/              # Raw exports from source Keycloak
│       │   └── {realm}.json
│       └── realm/            # Cleaned configs for import
│           └── {realm}.json
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

### Database Module (`db/`)

| File/Directory | Description |
|----------------|-------------|
| `session.json` | Current session state |
| `committed.json` | Committed migrations tracking |
| `plan.sql` | Generated migration plan |
| `schema.sql` | Generated schema from files |
| `session/` | Session migrations (temporary, cleared on commit) |
| `migrations/` | Committed migrations (for deployment) |

### Auth Module (`auth/`)

| File/Directory | Description |
|----------------|-------------|
| `raw/{realm}.json` | Raw export from source Keycloak (includes IDs, secrets) |
| `realm/{realm}.json` | Cleaned config ready for import (IDs, secrets stripped) |

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
  },
  "auth": {
    "source": {
      "url": "https://keycloak-dev.example.com",
      "adminUser": "admin",
      "adminPass": "password",
      "realm": "myapp-realm"
    },
    "target": {
      "url": "https://keycloak-staging.example.com",
      "adminUser": "admin",
      "adminPass": "password"
    },
    "configCliImage": "adorsys/keycloak-config-cli:6.4.0-24"
  }
}
```

Run `postkit init` to create the `.postkit/` directory structure.
