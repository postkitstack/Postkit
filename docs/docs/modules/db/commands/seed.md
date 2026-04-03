---
sidebar_position: 12
---

# db seed

Manage seed data from `db/schema/seeds/`.

## Usage

```bash
postkit db seed [--apply] [--target <target>]
```

**`<target>`**: `local` or `remote`

## Options

| Option | Description |
|--------|-------------|
| `--apply` | Apply seed data |
| `--target` | Target for apply: `local` or `remote` (default: local) |
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
```

## What It Does

Without `--apply`, displays the seed data SQL that would be run.

With `--apply`, executes the seed data SQL on the target database.

## Related

- [`infra`](/docs/modules/db/commands/infra) - Manage infrastructure
- [`grants`](/docs/modules/db/commands/grants) - Manage grants
