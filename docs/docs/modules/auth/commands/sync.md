---
sidebar_position: 3
---

# auth sync

Full sync — export from source then import to target, in sequence.

## Usage

```bash
postkit auth sync
postkit auth sync --force    # Skip all confirmations
postkit auth sync --verbose  # Show detailed output
```

## Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip all confirmation prompts (export and import) |
| `-v, --verbose` | Enable verbose output |

## What It Does

1. **Export** — Run `auth export` to get cleaned config from source
2. **Import** — Run `auth import` to apply config to target

This is equivalent to running:

```bash
postkit auth export --force
postkit auth import --force
```

## Example

```bash
$ postkit auth sync

Keycloak Realm Sync (Export + Import)

Keycloak Realm Export

[1/4] Loading configuration...
info Source : https://keycloak-dev.example.com
info Realm  : myapp-realm

[2/4] Confirming export...
? Export realm "myapp-realm" from https://keycloak-dev.example.com? (Y/n)

[3/4] Acquiring admin token...
✔ Token acquired

[4/4] Exporting and cleaning realm...
✔ Realm exported
✔ Config cleaned and saved

success Export complete!

info Raw    → .postkit/auth/raw/myapp-realm.json
info Clean  → .postkit/auth/realm/myapp-realm.json


Keycloak Realm Import

[1/3] Loading configuration...
info Target : https://keycloak-staging.example.com
info Config : .postkit/auth/realm/myapp-realm.json

[2/3] Confirming import...
? Import realm config to https://keycloak-staging.example.com? (y/N) y

[3/3] Importing via keycloak-config-cli...
✔ Realm imported successfully

success Import complete!

success Sync complete! Realm exported and imported successfully.
```

## CI/CD Usage

For automated pipelines, use `--force` to skip prompts:

```bash
postkit auth sync --force
```

## Requirements

- Docker must be running
- Source and target Keycloak must be accessible
- Valid `auth` configuration in `postkit.config.json`

## Related

- [`export`](/docs/modules/auth/commands/export) — Export only
- [`import`](/docs/modules/auth/commands/import) — Import only
