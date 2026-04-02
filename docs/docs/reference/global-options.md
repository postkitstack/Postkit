---
sidebar_position: 1
---

# Global Options

These options are available to all PostKit commands.

## Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose/debug output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output results as JSON (for scripting/CI) |
| `-V, --version` | Output version number |
| `-h, --help` | Display help for command |

## Examples

```bash
# Verbose output
postkit db start --verbose

# Dry run
postkit db deploy --dry-run

# JSON output
postkit db remote list --json

# Get version
postkit --version

# Get help
postkit --help
postkit db --help
postkit db deploy --help
```

## JSON Output Format

When using `--json`, commands output machine-readable JSON instead of formatted text. This is useful for:

- CI/CD pipelines
- Scripting
- Parsing results programmatically

**Example:**
```bash
$ postkit db remote list --json
{
  "remotes": [
    {
      "name": "dev",
      "url": "postgres://user:pass@host:5432/db",
      "default": true
    },
    {
      "name": "staging",
      "url": "postgres://user:pass@host:5432/db",
      "default": false
    }
  ]
}
```
