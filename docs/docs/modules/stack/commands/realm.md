---
sidebar_position: 7
---

# stack realm

Re-import the Keycloak realm template into the running Keycloak instance.

## Usage

```bash
postkit stack realm
```

## What It Does

1. Reads the realm template from `stack.keycloak.realmTemplate` (default: `.postkit/auth/realm/postkit.json`)
2. Runs `cleanRealmTemplate()` — strips builtin clients, strips IDs/secrets, injects JWT Role Mapper
3. Imports the cleaned template via `keycloak-config-cli` (`docker run --network postkit-net`)

Keycloak must be running before this command can succeed.

## When to Use

- After editing the realm template manually
- When Keycloak loses its configuration (e.g., after a container restart without a volume)
- To retry a failed Phase 4 initialization without restarting the whole stack

## JWT Role Mapper

The import automatically injects `script-primary-role.js` as a protocol mapper into every non-builtin client. This mapper converts Keycloak realm roles into JWT claims compatible with PostgREST role-based access control.
