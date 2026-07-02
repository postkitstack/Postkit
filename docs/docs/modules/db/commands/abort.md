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
2. Drops the local clone database
3. If the session used an auto-started Docker container (`containerID` is set in the session), stops and removes it
4. Removes the session file (`.postkit/db/session.json`)
5. Cleans up session-specific files (plan file, generated schema)

**Warning:** This will discard any uncommitted changes made during the session.

## Related

- [`start`](/docs/modules/db/commands/start) - Start a new session
- [`status`](/docs/modules/db/commands/status) - Check session state
