---
sidebar_position: 6
---

# stack keys

Fetch JWKs and client secrets from Keycloak and write them to `postkit.secrets.json`.

## Usage

```bash
postkit stack keys                        # Fetch and write keys
postkit stack keys --restart              # Fetch + restart PostgREST
postkit stack keys --clients "app,admin"  # Fetch keys for specific clients only
```

## Options

| Option | Description |
|--------|-------------|
| `--restart` | Restart PostgREST after updating secrets with new JWKs |
| `--clients <names>` | Comma-separated client names to fetch (overrides `stack.keycloak.clients` in config) |

## What It Does

1. Fetches public JWKs from Keycloak's JWKS endpoint
2. Fetches client secrets for configured clients
3. Writes the merged result to `postkit.secrets.json` under `stack.jwks` and `stack.clients`
4. If `--restart`: regenerates the compose file with updated JWT config and restarts PostgREST

This command is run automatically during `stack up` Phase 4 (first run). Use it manually to refresh keys without restarting the whole stack.
