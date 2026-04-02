---
sidebar_position: 3
---

# auth sync

Full sync — export from source then import to target, in sequence.

## Usage

```bash
postkit auth sync
```

## Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose output |
| `--json` | Output as JSON |

## What It Does

1. Runs `auth export` to get cleaned config from source
2. Runs `auth import` to apply config to target

## Requirements

- Docker must be running
- Source and target Keycloak must be accessible
- Environment variables must be configured (see [Configuration](/docs/modules/auth/configuration))

## Related

- [`export`](/docs/modules/auth/commands/export) - Export only
- [`import`](/docs/modules/auth/commands/import) - Import only
