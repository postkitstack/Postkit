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
3. Tests connection to remote database
4. Clones remote database to local using `pg_dump` and `psql`
5. Creates a session file (`.postkit/db/session.json`) to track state

## Related

- [`plan`](/docs/modules/db/commands/plan) - Generate schema diff
- [`status`](/docs/modules/db/commands/status) - Show session state
- [`abort`](/docs/modules/db/commands/abort) - Cancel session
