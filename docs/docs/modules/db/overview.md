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
│   $ postkit db start                 $ postkit db plan                       │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 1. Clone remote  │            │ 3. Generate      │                       │
│   │    to local DB   │            │    schema.sql    │                       │
│   │ 2. Start session │            │ 4. Run pgschema  │                       │
│   │    (track state) │            │    plan (diff)   │                       │
│   └────────┬─────────┘            │ 5. Save schema   │                       │
│            │                      │    fingerprint   │                       │
│            ▼                      └────────┬─────────┘                       │
│   ┌──────────────────┐                     │                                 │
│   │ User modifies    │                     ▼                                 │
│   │ schema files     │            ┌──────────────────┐                       │
│   │ (db/schema/*)    │            │ Shows changes    │                       │
│   └──────────────────┘            │ to apply         │                       │
│                                   └──────────────────┘                       │
│   $ postkit db apply                       │                                 │
│   ┌──────────────────┐                     ▼                                 │
│   │ 6. Validate      │            ┌──────────────────┐                       │
│   │    fingerprint   │            │ 7. Apply infra   │                       │
│   │ 7. Apply infra   │            │ 8. Create dbmate │                       │
│   │ 8. Create dbmate │            │    migration     │                       │
│   │    migration     │            │ 9. Run dbmate    │                       │
│   │ 9. Run dbmate    │            │    on local DB   │                       │
│   │    on local DB   │            │ 10. Apply grants │                       │
│   │ 10. Apply grants │            │ 11. Apply seeds  │                       │
│   │ 11. Apply seeds  │            └────────┬─────────┘                       │
│   └────────┬─────────┘                     │                                 │
│            │                               ▼                                 │
│   $ postkit db commit                                                        │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 12. Copy staging │            │ 13. Copy session │                       │
│   │     migrations   │            │     migrations   │                       │
│   │ 13. Update state │            │     to .postkit  │                       │
│   │ 14. Track for    │            │     /db/migrations│                      │
│   │     deploy       │            │ 15. Update state │                       │
│   └──────────────────┘            └──────────────────┘                       │
│                                                                              │
│   $ postkit db deploy                                                        │
│   ┌──────────────────┐            ┌──────────────────┐                       │
│   │ 15. Dry run on   │            │ 16. Deploy to    │                       │
│   │     local clone  │───────────►│     remote DB    │                       │
│   │                  │            │ 17. Mark as      │                       │
│   │                  │            │     deployed     │                       │
│   └──────────────────┘            └──────────────────┘                       │
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
| [`grants`](/docs/modules/db/commands/grants) | Manage grant statements |
| [`seed`](/docs/modules/db/commands/seed) | Manage seed data |

## Schema Directory Structure

```
db/schema/
├── infra/                    # Pre-migration (roles, schemas, extensions)
├── extensions/
├── types/
├── enums/
├── tables/
├── views/
├── functions/
├── triggers/
├── indexes/
├── grants/                   # Post-migration grants
└── seeds/                    # Post-migration seeds
```

## Prerequisites

- **PostgreSQL** client tools (`psql`, `pg_dump`)
- **pgschema** - Bundled with PostKit (no separate installation needed)
- **dbmate** - Auto-installed via npm (no separate installation needed)

## Troubleshooting

See [Troubleshooting](/docs/modules/db/troubleshooting) for common issues and solutions.
