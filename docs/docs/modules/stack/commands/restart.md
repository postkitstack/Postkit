---
sidebar_position: 5
---

# stack restart

Restart one or more services.

## Usage

```bash
postkit stack restart                     # Restart all services
postkit stack restart keycloak            # Restart keycloak only
postkit stack restart keycloak postgrest  # Restart multiple services
```

## Arguments

| Argument | Description |
|----------|-------------|
| `[services...]` | Services to restart. Omit for all. Valid: `postgres`, `keycloak`, `postgrest`, `traefik` |

Service names are validated before restarting. An unknown service name produces an error listing valid options.
