---
sidebar_position: 6
---

# db status

Show the current session state and pending changes.

## Usage

```bash
postkit db status
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

## Output

Shows the current session state including:
- Whether a session is active
- When the session was started
- Which remote was used
- Pending changes (planned, applied, etc.)

## Related

- [`start`](/docs/modules/db/commands/start) - Start a session
- [`abort`](/docs/modules/db/commands/abort) - Cancel session
