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

The auth module uses environment variables for Keycloak connections:

| Variable | Description | Required |
|----------|-------------|----------|
| `KC_SOURCE_URL` | Source Keycloak base URL | Yes |
| `KC_SOURCE_ADMIN_USER` | Source admin username | Yes |
| `KC_SOURCE_ADMIN_PASS` | Source admin password | Yes |
| `KC_SOURCE_REALM` | Realm name to export | Yes |
| `KC_TARGET_URL` | Target Keycloak base URL | Yes |
| `KC_TARGET_ADMIN_USER` | Target admin username | Yes |
| `KC_TARGET_ADMIN_PASS` | Target admin password | Yes |

See [Auth Configuration](/docs/modules/auth/configuration) for more details.
