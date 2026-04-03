---
sidebar_position: 2
---

# auth import

Import cleaned realm config to target Keycloak via `keycloak-config-cli` Docker container.

## Usage

```bash
postkit auth import
```

## Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose output |
| `--json` | Output as JSON |

## What It Does

1. Reads cleaned realm config from `realm-config/`
2. Runs `keycloak-config-cli` in Docker
3. Imports config to target Keycloak

## Requirements

- Docker must be running
- Cleaned config file must exist (run `export` first)
- Target Keycloak must be accessible
- Environment variables must be configured (see [Configuration](/docs/modules/auth/configuration))

## Related

- [`export`](/docs/modules/auth/commands/export) - Export from source
- [`sync`](/docs/modules/auth/commands/sync) - Export + import in one command
