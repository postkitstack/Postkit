---
sidebar_position: 2
---

# auth import

Import cleaned realm config to target Keycloak via `keycloak-config-cli` Docker container.

## Usage

```bash
postkit auth import
postkit auth import --force    # Skip confirmation
postkit auth import --verbose  # Show detailed output
```

## Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |

## What It Does

1. **Load configuration** — Read auth config from `postkit.config.json`
2. **Confirm import** — Prompt for confirmation (unless `--force`)
3. **Run Docker container** — Execute `keycloak-config-cli` with cleaned config
4. **Apply config** — Import realm configuration to target Keycloak

## Example

```bash
$ postkit auth import

Keycloak Realm Import

[1/3] Loading configuration...
info Target : https://keycloak-staging.example.com
info Config : .postkit/auth/realm/myapp-realm.json

[2/3] Confirming import...
? Import realm config to https://keycloak-staging.example.com? (y/N)

[3/3] Importing via keycloak-config-cli...
✔ Running keycloak-config-cli Docker container...
✔ Realm imported successfully

success Import complete!
```

## Requirements

- **Docker must be running** — Uses `keycloak-config-cli` container
- **Cleaned config must exist** — Run `export` first
- **Target Keycloak accessible** — Network connectivity required
- **Valid configuration** — `auth.target` in `postkit.config.json`

## Docker Image

Uses `adorsys/keycloak-config-cli` by default. Configure a different image in `postkit.config.json`:

```json
{
  "auth": {
    "configCliImage": "adorsys/keycloak-config-cli:6.4.0-24"
  }
}
```

## Related

- [`export`](/docs/modules/auth/commands/export) — Export from source
- [`sync`](/docs/modules/auth/commands/sync) — Export + import in one command
