---
sidebar_position: 7
---

# db abort

Cancel the current session and clean up all local resources.

## Usage

```bash
postkit db abort [-f]
```

## Options

| Option | Description |
|--------|-------------|
| `-f` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |
| `--json` | Output as JSON |

## What It Does

1. Prompts for confirmation (unless `-f`)
2. Removes the session file (`.postkit/db/session.json`)
3. Cleans up session-specific files

**Warning:** This will discard any uncommitted changes made during the session.

## Related

- [`start`](/docs/modules/db/commands/start) - Start a new session
- [`status`](/docs/modules/db/commands/status) - Check session state
