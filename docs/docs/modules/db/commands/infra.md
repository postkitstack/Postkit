---
sidebar_position: 10
---

# db infra

Manage infrastructure SQL (roles, schemas, extensions) from `db/schema/infra/`.

## Usage

```bash
postkit db infra [--apply] [--target <target>]
```

**`<target>`**: `local` or `remote`

## Options

| Option | Description |
|--------|-------------|
| `--apply` | Apply infrastructure SQL |
| `--target` | Target for apply: `local` or `remote` (default: local) |
| `-v, --verbose` | Enable verbose output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output as JSON |

## Examples

```bash
# Show infra statements
postkit db infra

# Apply to local database
postkit db infra --apply

# Apply to remote database
postkit db infra --apply --target=remote
```

## What It Does

Without `--apply`, displays the infrastructure SQL that would be run.

With `--apply`, executes the infrastructure SQL on the target database.

## Related

- [`grants`](/docs/modules/db/commands/grants) - Manage grant statements
- [`seed`](/docs/modules/db/commands/seed) - Manage seed data
