---
sidebar_position: 5
---

# db deploy

Deploy committed migrations to a remote database with dry-run verification.

## Usage

```bash
postkit db deploy [--remote <name>] [--url <url>] [-f] [--dry-run]
```

## Options

| Option | Description |
|--------|-------------|
| `--remote <name>` | Use specific remote (otherwise uses default) |
| `--url <url>` | Direct URL override |
| `-f` | Skip confirmation prompts |
| `--dry-run` | Verify only, don't touch target |
| `-v, --verbose` | Enable verbose output |
| `--json` | Output as JSON |

## Examples

```bash
# Uses default remote
postkit db deploy

# Use specific remote
postkit db deploy --remote staging

# Dry run to verify
postkit db deploy --remote production --dry-run

# Skip confirmations
postkit db deploy --remote staging -f
```

## What It Does

1. Resolves the target database URL (from remote config or `--url` flag)
2. If an active session exists, removes it (with confirmation unless `-f`)
3. Tests the target database connection
4. Clones the target database to local (using `LOCAL_DATABASE_URL`)
5. Runs a full dry-run on the local clone: infra, dbmate migrate, grants, seeds
6. If `--dry-run` is set, stops here and reports results
7. Reports dry-run results and confirms deployment (unless `-f`)
8. Applies to target: infra, dbmate migrate, grants, seeds
9. Drops the local clone database
10. Marks migrations as deployed in `.postkit/db/committed.json`

If the dry run fails, deployment is aborted and no changes are made to the target database.

## Requirements

- Committed migrations must exist (run `db commit` first)
- PostgreSQL client tools must be installed
- `localDbUrl` must be different from the target remote URL

## Related

- [`commit`](/docs/modules/db/commands/commit) - Commit migrations
- [`status`](/docs/modules/db/commands/status) - Show session state
