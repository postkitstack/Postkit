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

The `db/schema/` directory contains your database schema definitions:

| Directory | Description |
|-----------|-------------|
| `infra/` | Pre-migration infrastructure (roles, schemas, extensions) |
| `extensions/` | Database extensions |
| `types/` | Custom types |
| `enums/` | Enum definitions |
| `tables/` | Table definitions |
| `views/` | View definitions |
| `functions/` | Function definitions |
| `triggers/` | Trigger definitions |
| `indexes/` | Index definitions |
| `grants/` | Post-migration grant statements |
| `seeds/` | Post-migration seed data |

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
