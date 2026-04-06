---
sidebar_position: 2
---

# Configuration

PostKit uses a `postkit.config.json` file in your project root for configuration.

## Basic Configuration

```json
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "schemaPath": "db/schema",
    "schema": "public",
    "remotes": {
      "dev": {
        "url": "postgres://user:pass@dev-host:5432/myapp",
        "default": true
      },
      "staging": {
        "url": "postgres://user:pass@staging-host:5432/myapp"
      }
    }
  }
}
```

## Configuration Options

### `db.localDbUrl` (required)

PostgreSQL connection URL for your local clone database.

### `db.schemaPath` (optional)

Path to your schema files, relative to project root. Default: `"db/schema"`.

### `db.schema` (optional)

Database schema name. Default: `"public"`.

### `db.remotes` (required)

Named remote database configurations. At least one remote must be configured.

#### Remote Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | string | Yes | PostgreSQL connection URL |
| `default` | boolean | No | Mark as default remote (one must be default) |
| `addedAt` | string | No | ISO timestamp when remote was added (auto-set) |

## Environment Variables

For sensitive data like database passwords, use environment variables:

```bash
# .env file
DEV_DB_URL="postgres://user:pass@dev-host:5432/myapp"
STAGING_DB_URL="postgres://user:pass@staging-host:5432/myapp"
```

Then reference them in your config:

```json
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "remotes": {
      "dev": {
        "url": "${DEV_DB_URL}",
        "default": true
      }
    }
  }
}
```

## Auth Module Configuration

The auth module is configured in `postkit.config.json`:

```json
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
    },
    "configCliImage": "adorsys/keycloak-config-cli:6.4.0-24"
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
