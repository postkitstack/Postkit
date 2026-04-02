---
sidebar_position: 1
---

# auth export

Export realm from source Keycloak, clean it, and save to disk.

## Usage

```bash
postkit auth export
```

## Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose output |
| `--json` | Output as JSON |

## What It Does

1. Authenticates with source Keycloak (admin token via REST API)
2. Exports realm config via partial-export API
3. Saves raw export to `.tmp-config/`
4. Cleans config (strips IDs, secrets, keys, credentials)
5. Saves cleaned config to `realm-config/`

## Requirements

- Source Keycloak must be accessible
- Environment variables must be configured (see [Configuration](/docs/modules/auth/configuration))

## Related

- [`import`](/docs/modules/auth/commands/import) - Import to target
- [`sync`](/docs/modules/auth/commands/sync) - Export + import in one command
