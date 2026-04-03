---
sidebar_position: 3
---

# Quick Start

This guide will walk you through setting up PostKit and running your first database migration.

## 1. Initialize a Project

```bash
# Create a new directory
mkdir my-app && cd my-app

# Initialize with PostKit CLI
postkit init
```

This creates:
- `postkit.config.json` - Your configuration file
- `db/schema/` - Your schema files directory
- `.postkit/` - Runtime files (gitignored)

## 2. Configure Remotes

Add your remote databases:

```bash
# Add development remote (set as default)
postkit db remote add dev "postgres://user:pass@dev-host:5432/myapp" --default

# Add staging remote
postkit db remote add staging "postgres://user:pass@staging-host:5432/myapp"
```

## 3. Start a Migration Session

Clone a remote database to your local machine:

```bash
postkit db start
```

This:
1. Clones the remote database to local
2. Creates a session to track your changes
3. Prepares for schema modifications

## 4. Make Schema Changes

Edit files in `db/schema/`:

```sql
-- db/schema/tables/users.sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 5. Preview Changes

See what will change:

```bash
postkit db plan
```

## 6. Apply Changes Locally

Test your changes on the local clone:

```bash
postkit db apply
```

## 7. Commit for Deployment

```bash
postkit db commit
```

This creates a migration file ready for deployment.

## 8. Deploy to Remote

```bash
postkit db deploy --remote staging
```

PostKit performs a dry-run first to verify the migration works, then deploys to your remote database.

## Common Commands

| Command | Description |
|---------|-------------|
| `postkit db start` | Start a migration session |
| `postkit db plan` | Preview schema changes |
| `postkit db apply` | Apply changes to local DB |
| `postkit db commit` | Commit migrations for deployment |
| `postkit db deploy` | Deploy to remote database |
| `postkit db status` | Show session state |
| `postkit db abort` | Cancel session and clean up |

## Next Steps

- [DB Module Overview](/docs/modules/db/overview) - Learn about the full migration workflow
- [Auth Module Overview](/docs/modules/auth/overview) - Manage Keycloak configurations
- [Global Options](/docs/reference/global-options) - See all available CLI options
