---
name: postkit-auth
description: Manage Keycloak realm configuration with PostKit — export, import, and sync auth configs. Use when the user mentions Keycloak, realm configuration, auth export/import, or auth sync.
allowed-tools: Bash(postkit *)
---

# PostKit Auth (Keycloak) Management

PostKit's auth module manages Keycloak realm configuration through export, import, and sync operations.

## Commands

### Export Realm Configuration

```bash
postkit auth export
```

Exports the realm from the source Keycloak, cleans the config, and saves it locally.

### Import Realm Configuration

```bash
postkit auth import
```

Imports the cleaned realm configuration to the target Keycloak instance.

### Full Sync (Export + Import)

```bash
postkit auth sync
```

Runs export followed by import in sequence — the most common operation for syncing realm configs between environments.

Add `-f` to skip confirmation prompts:

```bash
postkit auth sync -f
```

## Typical Workflow

1. Make changes in the source Keycloak UI
2. Run `postkit auth export` to pull and clean the config
3. Review the exported config
4. Run `postkit auth import` to push to the target, or `postkit auth sync` for both steps at once

## Configuration

Auth configuration is part of `postkit.config.json` under the `auth` key. The config includes Keycloak connection details for source and target environments.

## Notes

- The export process **cleans** the realm config — it removes environment-specific data like IDs and timestamps.
- Always review the exported config before importing.
- Use `--force` or `-f` to skip confirmation prompts in CI/CD pipelines.
