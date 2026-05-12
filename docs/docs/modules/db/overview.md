---
sidebar_position: 1
---

# Database Module

The `db` module provides a **session-based database migration workflow** for safe schema changes. Clone your remote database locally, develop and test changes, then deploy with confidence.

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMLINED MIGRATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   $ postkit db start                                                         │
│   ┌────────────────────────────────────────────┐                             │
│   │ 1. Detect remote PostgreSQL version        │                             │
│   │ 2. Clone remote DB to local (or Docker)    │                             │
│   │ 3. Start session (track state)             │                             │
│   └────────────────────┬───────────────────────┘                             │
│                        │                                                     │
│                        ▼  (edit db/schema/<name>/ files)                    │
│                                                                              │
│   $ postkit db plan                                                          │
│   ┌────────────────────────────────────────────┐                             │
│   │ 4.  Apply infra (roles, schemas, exts)     │                             │
│   │ 5.  Combine schema files → schema_*.sql    │                             │
│   │ 6.  Run pgschema diff per schema           │                             │
│   │ 7.  Intermediate apply between schemas     │                             │
│   │ 8.  Save plan_*.sql + fingerprints         │                             │
│   └────────────────────┬───────────────────────┘                             │
│                        │                                                     │
│                        ▼  (review printed diff)                              │
│                                                                              │
│   $ postkit db apply                                                         │
│   ┌────────────────────────────────────────────┐                             │
│   │ 9.  Validate schema fingerprints           │                             │
│   │ 10. Apply infra to local DB                │                             │
│   │ 11. Wrap plan SQL → dbmate migration file  │                             │
│   │ 12. Run dbmate on local DB                 │                             │
│   │ 13. Apply seeds                            │                             │
│   └────────────────────┬───────────────────────┘                             │
│                        │                                                     │
│                        ▼  (verify locally)                                  │
│                                                                              │
│   $ postkit db commit                                                        │
│   ┌────────────────────────────────────────────┐                             │
│   │ 14. Copy session migrations → .postkit/db/ │                             │
│   │     migrations/                            │                             │
│   │ 15. Register in committed.json             │                             │
│   │ 16. Clear session state                    │                             │
│   └────────────────────┬───────────────────────┘                             │
│                        │                                                     │
│                        ▼                                                     │
│                                                                              │
│   $ postkit db deploy                                                        │
│   ┌────────────────────────────────────────────┐                             │
│   │ 17. Dry run on fresh local clone           │                             │
│   │ 18. Deploy to remote DB via dbmate         │                             │
│   │ 19. Mark migrations as deployed            │                             │
│   └────────────────────────────────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| [`start`](/docs/modules/db/commands/start) | Clone remote DB to local, start session |
| [`plan`](/docs/modules/db/commands/plan) | Generate schema diff |
| [`apply`](/docs/modules/db/commands/apply) | Apply migration to local DB |
| [`commit`](/docs/modules/db/commands/commit) | Commit session migrations |
| [`deploy`](/docs/modules/db/commands/deploy) | Deploy to remote database |
| [`status`](/docs/modules/db/commands/status) | Show session state |
| [`abort`](/docs/modules/db/commands/abort) | Cancel session |
| [`migration`](/docs/modules/db/commands/migration) | Create manual migration |
| [`remote`](/docs/modules/db/commands/remote) | Manage remote databases |
| [`infra`](/docs/modules/db/commands/infra) | Manage infrastructure SQL |
| [`seed`](/docs/modules/db/commands/seed) | Manage seed data |
| [`schema`](/docs/modules/db/commands/schema) | Add schemas and scaffold directory structure |
| [`import`](/docs/modules/db/commands/import) | Import existing database as baseline |

## Important Notes

**pgschema operates at the schema level only.** Cluster and database level commands (like `CREATE DATABASE`, `CREATE ROLE`, `CREATE EXTENSION`) are not supported and must be handled through the `db/infra/` directory or manual migrations.

See [Plan Command Limitations](/docs/modules/db/plan-limitations) for details.

## Schema Directory Structure

Multiple schemas are managed via the `schemas` array in config. Array order determines execution order. Each schema has its own subdirectory under `db/schema/`.

Your schema files are organized into three categories:

### 1. Infrastructure (Handled Separately)

```
db/infra/
├── 001_roles.sql       # CREATE ROLE, CREATE USER (pre-migration)
├── 002_schemas.sql      # CREATE SCHEMA (pre-migration)
└── 003_extensions.sql   # CREATE EXTENSION (pre-migration)
```

**Note:** `db/infra/` holds DB-level objects and is NOT inside a schema subdirectory. Files here are **excluded from pgschema** and applied separately.

### 2. Schema Objects (Processed by `postkit db plan`)

The `plan` command uses pgschema to process these directories per schema:

```
db/schema/
└── <name>/             # Schema name (e.g. public, app)
    ├── types/              # Custom types
    ├── enums/              # ENUM types
    ├── tables/             # CREATE TABLE, ALTER TABLE
    ├── views/              # CREATE VIEW
    ├── materialized_views/ # CREATE MATERIALIZED VIEW
    ├── functions/          # CREATE FUNCTION
    ├── triggers/           # CREATE TRIGGER
    ├── indexes/             # CREATE INDEX
    └── constraints/        # PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK
```

**File naming:** When importing via `postkit db import`, files are automatically prefixed with numeric ordering (e.g. `001_users.sql`, `002_posts.sql`) based on the pgschema dump order. For manually created files, any naming convention works — files are sorted alphabetically within each directory.

**Supported:** Tables, views, functions, triggers, indexes, constraints, enums, domains, sequences

### 3. Post-Migration (Handled Separately)

```
db/schema/<name>/
└── seeds/              # Seed data (post-migration)
```

**Note:** Seeds are applied separately after the main migration, per schema.

### Execution Order

1. **Pre-migration:** `db/infra/` (roles, schemas, extensions)
2. **Migration:** For each schema in config order — pgschema processes types → enums → tables → views → materialized_views → functions → triggers → indexes → constraints
3. **Post-migration:** `seeds/` for each schema in config order (data)

## Prerequisites

- **pgschema** - Bundled with PostKit (no separate installation needed)
- **dbmate** - Auto-installed via npm (no separate installation needed)
- **Docker** _(optional)_ - Required only when `db.localDbUrl` is empty. PostKit starts a `postgres:{version}-alpine` container automatically, version-matched to your remote DB.

## Troubleshooting

See [Troubleshooting](/docs/modules/db/troubleshooting) for common issues and solutions.
