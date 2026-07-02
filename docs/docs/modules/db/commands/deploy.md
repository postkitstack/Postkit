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
3. Tests the target database connection and detects its PostgreSQL major version
4. **If `localDbUrl` is empty**: Starts a temporary `postgres:{version}-alpine` container for the dry-run, version-matched to the target
5. Clones the target database to local for dry-run verification. When using a temp container, cloning runs via `docker exec` inside the container
6. Runs a full dry-run on the local clone: infra, dbmate migrate, seeds
7. If `--dry-run` is set, stops here and reports results without touching the target
8. Reports dry-run results and confirms deployment (unless `-f`)
9. Applies to target: infra, dbmate migrate, seeds
10. Drops the local clone database; stops and removes the temp container if one was used

If the dry run fails, deployment is aborted and no changes are made to the target database.

## Requirements

- Committed migrations must exist (run `db commit` first)
- `localDbUrl` must be different from the target remote URL (or leave it empty to use an auto-container)
- Docker must be running if `localDbUrl` is empty

## Related

- [`commit`](/docs/modules/db/commands/commit) - Commit migrations
- [`status`](/docs/modules/db/commands/status) - Show session state
