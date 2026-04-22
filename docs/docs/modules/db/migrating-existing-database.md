---
sidebar_position: 2
---

# Migrating an Existing Database

If you have an existing PostgreSQL database that is not yet managed by PostKit, you can bring it under PostKit's migration workflow using the [`db import`](/docs/modules/db/commands/import) command. This creates a baseline from your current schema so you can start using PostKit's plan/apply/deploy cycle going forward.

## When to Use This

- You have an existing PostgreSQL database and want to start managing it with PostKit
- You want to adopt PostKit's session-based migration workflow for an established project
- You need to onboard a database that was created outside of PostKit

## Prerequisites

- PostgreSQL client tools (`psql`, `pg_dump`) installed
- Access to the source database (connection URL)
- A `postkit.config.json` configured with a `localDbUrl`

If you haven't set up PostKit yet, run `postkit init` first. See [Installation](/docs/getting-started/installation) and [Configuration](/docs/getting-started/configuration).

## Step-by-Step Migration

### 1. Add a Remote (Optional)

If you want to target a specific remote database for future deployments, add it now:

```bash
postkit db remote add dev "postgres://user:pass@dev-host:5432/myapp" --default
```

See [`db remote`](/docs/modules/db/commands/remote) for more details.

### 2. Import the Database

Run the import command against your existing database:

```bash
# Import using localDbUrl from config
postkit db import

# Or point to a specific database
postkit db import --url "postgres://user:pass@host:5432/myapp"
```

This will:
- Dump the schema from your database using `pgschema`
- Organize SQL files into PostKit's schema directory structure (`tables/`, `views/`, `functions/`, etc.)
- Extract roles and schemas into `infra/`
- Create a baseline migration in `.postkit/db/migrations/`
- Set up your local database with the imported schema

For all available options, see the [`db import` command reference](/docs/modules/db/commands/import).

### 3. Review the Generated Schema Files

After import, your schema directory will be populated:

```
db/schema/
├── infra/
│   ├── roles.sql              # Extracted roles
│   └── schemas.sql            # Extracted schemas
├── tables/
│   ├── 001_app_config.sql     # Numeric prefix ordering
│   ├── 002_app_user.sql
│   └── ...
├── views/
├── functions/
├── grants/
│   └── public.sql             # Consolidated privileges
└── .pgschemaignore
```

Review the files to make sure everything looks correct. You can rename, split, or reorganize files as needed.

### 4. Start the Normal Workflow

Once imported, you're ready to use PostKit's standard migration workflow:

```bash
# Add a remote for deployment
postkit db remote add production "postgres://..."

# Start a migration session
postkit db start

# Edit schema files in db/schema/...

# Preview changes
postkit db plan

# Apply to local database
postkit db apply

# Commit migrations
postkit db commit

# Deploy to remote
postkit db deploy
```

See [DB Module Overview](/docs/modules/db/overview) for the full workflow diagram.

## What Happens Behind the Scenes

The import process performs these steps automatically:

1. Connects to the source database and reports table count
2. Dumps the schema using `pgschema dump --multi-file`
3. Adds numeric prefixes to SQL files based on dependency order
4. Normalizes the dump into PostKit's directory structure
5. Extracts roles, schemas, and extensions into `infra/`
6. Creates a baseline migration and registers it in `committed.json`
7. Sets up the local database with the imported schema
8. Syncs migration state back to the source database

For the full technical details, see [`db import`](/docs/modules/db/commands/import).

## Next Steps

- [DB Module Overview](/docs/modules/db/overview) — Full workflow and command reference
- [Configuration](/docs/getting-started/configuration) — PostKit config options
- [Troubleshooting](/docs/modules/db/troubleshooting) — Common issues and solutions
