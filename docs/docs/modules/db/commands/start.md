---
sidebar_position: 1
---

# db start

Clone a remote database to local and initialize a migration session.

## Usage

```bash
postkit db start [--remote <name>]
```

## Options

| Option | Description |
|--------|-------------|
| `--remote <name>` | Use specific remote (otherwise uses default) |
| `-v, --verbose` | Enable verbose output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output as JSON |

## Examples

```bash
# Uses default remote
postkit db start

# Use specific remote
postkit db start --remote staging
```

## What It Does

1. Checks prerequisites (pgschema, dbmate installed)
2. Resolves target remote (default or specified)
3. Tests connection to remote database and detects its PostgreSQL major version
4. Checks for pending committed migrations
5. **If `localDbUrl` is empty**: Checks Docker availability and starts a `postgres:{version}-alpine` container on a free port (15432–15532), version-matched to the remote
6. Clones remote database to local. When using an auto-container, cloning runs via `docker exec` inside the container (no host `pg_dump`/`psql` required)
7. Creates a session file (`.postkit/db/session.json`) to track state, including the `containerID` if a container was started

## Auto Docker Container

When `db.localDbUrl` is not set in your secrets file, PostKit automatically:
- Pulls and starts `postgres:{remote-version}-alpine`
- Uses `docker exec` to run `pg_dump`/`psql` inside the container (version-matched tools)
- Stores the container ID in the session
- Stops and removes the container when you run `postkit db abort`

## Related

- [`plan`](/docs/modules/db/commands/plan) - Generate schema diff
- [`status`](/docs/modules/db/commands/status) - Show session state
- [`abort`](/docs/modules/db/commands/abort) - Cancel session
