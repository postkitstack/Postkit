---
sidebar_position: 4
---

# stack logs

Tail logs for all services or a specific service.

## Usage

```bash
postkit stack logs                        # Follow all services
postkit stack logs keycloak               # Keycloak logs only
postkit stack logs postgres --no-follow   # Print last 100 lines and exit
postkit stack logs postgrest -n 50        # Last 50 lines, then follow
```

## Arguments

| Argument | Description |
|----------|-------------|
| `[service]` | Service name to tail. Omit for all services. |

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `-f, --follow` | true | Stream logs continuously |
| `--no-follow` | — | Print last N lines and exit |
| `-n, --tail <number>` | 100 | Number of lines to show |

Press `Ctrl+C` to stop following.
