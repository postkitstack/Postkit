---
sidebar_position: 2
---

# Configuration

PostKit separates non-sensitive settings from credentials using two config files.

## Config Files

| File | Commit to Git | Purpose |
|------|--------------|---------|
| `postkit.config.json` | **Yes** | Schema paths, remote names, non-sensitive settings |
| `postkit.secrets.json` | **No** (gitignored) | Database URLs, passwords, credentials |

Both files are deep-merged at load time. `postkit init` creates all three files: the config, the secrets file, and a `postkit.secrets.example.json` template your team can use as a reference.

## `postkit.config.json` (committed)

```json
{
  "db": {
    "localDbUrl": "",
    "schemaPath": "db/schema",
    "schema": "public",
    "remotes": {
      "dev": {
        "default": true,
        "addedAt": "2024-12-31T10:00:00.000Z"
      },
      "staging": {
        "addedAt": "2024-12-31T10:00:00.000Z"
      }
    }
  }
}
```

## `postkit.secrets.json` (gitignored)

```json
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "remotes": {
      "dev": {
        "url": "postgres://user:pass@dev-host:5432/myapp"
      },
      "staging": {
        "url": "postgres://user:pass@staging-host:5432/myapp"
      }
    }
  }
}
```

## Configuration Options

### `db.localDbUrl` (optional)

PostgreSQL connection URL for your local clone database. **Leave empty** to have PostKit automatically start a Docker container (`postgres:{version}-alpine`) for you. The container image version is matched to your remote PostgreSQL version automatically and the container is cleaned up when you abort the session.

### `db.schemaPath` (optional)

Path to your schema files, relative to project root. Default: `"db/schema"`.

### `db.schema` (optional)

Database schema name. Default: `"public"`.

### `db.remotes` (required)

Named remote database configurations. At least one remote must be configured. Remote metadata (name, default flag, addedAt) goes in `postkit.config.json`; the URL goes in `postkit.secrets.json`. The `postkit db remote add` command handles this split automatically.

#### Remote Properties

| Property | File | Required | Description |
|----------|------|----------|-------------|
| `url` | secrets | Yes | PostgreSQL connection URL |
| `default` | config | No | Mark as default remote (one must be default) |
| `addedAt` | config | No | ISO timestamp when remote was added (auto-set) |

## Auth Module Configuration

The auth module is configured in `postkit.config.json` (non-sensitive settings) and `postkit.secrets.json` (credentials):

```json
// postkit.secrets.json
{
  "auth": {
    "source": {
      "url": "https://keycloak-dev.example.com",
      "adminUser": "admin",
      "adminPass": "dev-password",
      "realm": "myapp-realm"
    },
    "target": {
      "url": "https://keycloak-staging.example.com",
      "adminUser": "admin",
      "adminPass": "staging-password"
    }
  }
}
```

### Auth Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `auth.source.url` | string | Yes | Source Keycloak base URL |
| `auth.source.adminUser` | string | Yes | Source admin username |
| `auth.source.adminPass` | string | Yes | Source admin password |
| `auth.source.realm` | string | Yes | Realm name to export |
| `auth.target.url` | string | Yes | Target Keycloak base URL |
| `auth.target.adminUser` | string | Yes | Target admin username |
| `auth.target.adminPass` | string | Yes | Target admin password |
| `auth.configCliImage` | string | No | Docker image for import (default: `adorsys/keycloak-config-cli:6.4.0-24`) |

See [Auth Configuration](/docs/modules/auth/configuration) for more details.
