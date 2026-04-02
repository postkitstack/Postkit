---
sidebar_position: 8
---

# db migration

Create a manual SQL migration file in the session directory.

## Usage

```bash
postkit db migration [<name>]
```

## Options

| Option | Description |
|--------|-------------|
| `<name>` | Migration name (optional) |
| `-v, --verbose` | Enable verbose output |
| `--json` | Output as JSON |

## Examples

```bash
# Create migration with auto-generated name
postkit db migration

# Create migration with custom name
postkit db migration add_users_table
```

## What It Does

Creates a new SQL file in `.postkit/db/session/` with a timestamp-based filename.

## Related

- [`apply`](/docs/modules/db/commands/apply) - Apply migrations locally
- [`commit`](/docs/modules/db/commands/commit) - Commit migrations
