---
sidebar_position: 1
---

# auth export

Export realm from source Keycloak, clean it, and save to `.postkit/auth/`.

## Usage

```bash
postkit auth export
postkit auth export --force    # Skip confirmation
postkit auth export --verbose  # Show detailed output
```

## Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |

## What It Does

1. **Load configuration** — Read auth config from `postkit.config.json`
2. **Confirm export** — Prompt for confirmation (unless `--force`)
3. **Acquire admin token** — Authenticate with source Keycloak via REST API
4. **Export realm** — Fetch realm configuration via partial-export API
5. **Clean config** — Strip IDs, secrets, keys, and credentials
6. **Save files** — Write raw and cleaned configs to `.postkit/auth/`

## Output

```
.postkit/auth/
├── raw/
│   └── {realm}.json      # Raw export (includes IDs, secrets)
└── realm/
    └── {realm}.json      # Cleaned config (safe for import)
```

## Example

```bash
$ postkit auth export

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
```

## Requirements

- Source Keycloak must be accessible
- `postkit.config.json` must have valid `auth.source` configuration
- Run `postkit init` first to create `.postkit/auth/` directory

## Related

- [`import`](/docs/modules/auth/commands/import) — Import to target
- [`sync`](/docs/modules/auth/commands/sync) — Export + import in one command
