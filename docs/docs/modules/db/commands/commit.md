---
sidebar_position: 4
---

# db commit

Commit session migrations for deployment.

## Usage

```bash
postkit db commit [-f]
```

## Options

| Option | Description |
|--------|-------------|
| `-f` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |
| `--json` | Output as JSON |

## What It Does

1. Prompts for a migration description
2. Merges all session migrations from `.postkit/db/session/` into a single migration file
3. Writes the committed migration to `.postkit/db/migrations/`
4. Updates `.postkit/db/committed.json` to track the committed migration
5. Cleans up session files

## Requirements

- An active session must exist
- Session migrations must exist (run `db apply` at least once)

## Related

- [`apply`](/docs/modules/db/commands/apply) - Apply changes locally
- [`deploy`](/docs/modules/db/commands/deploy) - Deploy to remote
