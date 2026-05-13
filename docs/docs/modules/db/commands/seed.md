---
sidebar_position: 12
---

# db seed

Manage seed data from `db/schema/<name>/seeds/`.

## Usage

```bash
postkit db seed [--apply] [--target <target>] [--schema <name>]
```

**`<target>`**: `local` or `remote`

## Options

| Option | Description |
|--------|-------------|
| `--apply` | Apply seed data |
| `--target` | Target for apply: `local` or `remote` (default: local) |
| `--schema <name>` | Apply seeds for one schema only |
| `-v, --verbose` | Enable verbose output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output as JSON |

## Examples

```bash
# Show seed statements
postkit db seed

# Apply to local database
postkit db seed --apply

# Apply to remote database
postkit db seed --apply --target=remote

# Apply seeds for app schema only
postkit db seed --apply --schema app
```

## What It Does

Without `--apply`, displays seed SQL across all schemas (or the specified schema).

With `--apply`, executes seed SQL for each schema in config order (or just `--schema <name>` if specified).

## Related

- [`infra`](/docs/modules/db/commands/infra) - Manage infrastructure
