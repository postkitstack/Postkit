---
name: postkit-auth
description: Manage Keycloak realm configuration with PostKit — export, import, and sync auth configs between environments. Use this skill whenever the user mentions Keycloak, realm configuration, auth export/import, auth sync, SSO setup, identity provider configuration, login settings, user roles or permissions in Keycloak, or moving auth config between environments — even if they don't explicitly mention PostKit.
argument-hint: "[command]"
allowed-tools: Bash(postkit *)
---

# PostKit Auth (Keycloak) Management

PostKit's auth module manages Keycloak realm configuration through export, import, and sync operations. It moves realm config between environments while stripping environment-specific data.

## How It Works

The auth module connects to two Keycloak instances:
- **Source** — where you make changes (typically dev/staging Keycloak)
- **Target** — where you push the cleaned config (typically production)

The export process pulls the realm from source, strips IDs, secrets, and credentials, and saves a clean config. The import process uses `keycloak-config-cli` (via Docker) to apply the cleaned config to the target.

## Configuration

Auth config lives in `postkit.config.json` under the `auth` key:

```json
{
  "auth": {
    "source": {
      "url": "https://keycloak.dev.example.com",
      "adminUser": "admin",
      "adminPass": "admin",
      "realm": "my-app"
    },
    "target": {
      "url": "https://keycloak.prod.example.com",
      "adminUser": "admin",
      "adminPass": "admin"
    },
    "configCliImage": "kicony/keycloak-config-cli:latest"
  }
}
```

Key fields:
- `source.url` — Source Keycloak base URL
- `source.realm` — Realm name to export from
- `source.adminUser` / `source.adminPass` — Admin credentials for source
- `target.url` — Target Keycloak base URL (realm name inherited from source)
- `target.adminUser` / `target.adminPass` — Admin credentials for target
- `configCliImage` — Docker image for keycloak-config-cli (optional, has a default)

## Commands

### Export Realm Configuration

```bash
postkit auth export
```

Steps:
1. Authenticates with source Keycloak
2. Exports the full realm configuration (JSON)
3. Strips environment-specific data (IDs, secrets, credentials)
4. Saves raw and cleaned exports

Output files saved in `.postkit/auth/`:
- `raw/` — Full export with all data
- `realm/` — Cleaned config safe for version control and import

### Import Realm Configuration

```bash
postkit auth import
```

Steps:
1. Reads the cleaned export from `.postkit/auth/realm/`
2. Runs `keycloak-config-cli` via Docker to apply the config to target
3. Reports success or failure

Requires Docker to be running.

### Full Sync (Export + Import)

```bash
postkit auth sync
```

Runs export followed by import in sequence. Most common operation for syncing realm configs between environments.

Add `-f` to skip confirmation prompts:

```bash
postkit auth sync -f
```

## Typical Workflows

### Syncing a realm from dev to staging

```bash
# Make changes in the source Keycloak admin UI first
postkit auth sync
```

### Export only (review before importing)

```bash
postkit auth export
# Review .postkit/auth/realm/ files
postkit auth import
```

### CI/CD pipeline usage

```bash
postkit auth sync -f
```

## Notes

- The export process **cleans** the realm config — removes environment-specific data like IDs and timestamps, making it safe to commit to git.
- Always review the cleaned export before importing to production.
- Use `--force` or `-f` to skip confirmation prompts in CI/CD pipelines.
- Docker must be available for the import step (keycloak-config-cli runs as a container).
