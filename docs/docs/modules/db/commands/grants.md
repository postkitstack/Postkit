---
sidebar_position: 11
---

# db grants

Regenerate and display grant statements from `db/schema/grants/`.

## Usage

```bash
postkit db grants [--apply] [--target <target>]
```

**`<target>`**: `local` or `remote`

## Options

| Option | Description |
|--------|-------------|
| `--apply` | Apply grant statements |
| `--target` | Target for apply: `local` or `remote` (default: local) |
| `-v, --verbose` | Enable verbose output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output as JSON |

## Examples

```bash
# Show grants
postkit db grants

# Apply to local database
postkit db grants --apply

# Apply to remote database
postkit db grants --apply --target=remote
```

## What It Does

Without `--apply`, displays the grant statements that would be run.

With `--apply`, executes the grant statements on the target database.

## Related

- [`infra`](/docs/modules/db/commands/infra) - Manage infrastructure
- [`seed`](/docs/modules/db/commands/seed) - Manage seed data
