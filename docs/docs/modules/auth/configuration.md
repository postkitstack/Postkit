---
sidebar_position: 10
---

# Auth Configuration

The auth module is configured in `postkit.config.json`. Configuration is validated with Zod for type safety and clear error messages.

## Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `auth.source.url` | string | Source Keycloak base URL | `https://keycloak-dev.example.com` |
| `auth.source.adminUser` | string | Source admin username | `admin` |
| `auth.source.adminPass` | string | Source admin password | `password123` |
| `auth.source.realm` | string | Realm name to export | `myapp-realm` |
| `auth.target.url` | string | Target Keycloak base URL | `https://keycloak-staging.example.com` |
| `auth.target.adminUser` | string | Target admin username | `admin` |
| `auth.target.adminPass` | string | Target admin password | `password123` |

## Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auth.configCliImage` | string | `adorsys/keycloak-config-cli:6.4.0-24` | Docker image for import |

## Example Configuration

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

## Validation Errors

If configuration is invalid, you'll see clear error messages:

```
Invalid auth configuration:
  • source.url: Source URL is required
  • source.realm: Source realm is required
  • target.url: Target URL is required
```

## Output Paths

Auth files are stored in `.postkit/auth/` (created by `postkit init`):

| Path | Description |
|------|-------------|
| `.postkit/auth/raw/{realm}.json` | Raw export from source Keycloak |
| `.postkit/auth/realm/{realm}.json` | Cleaned config ready for import |

The filename is automatically derived from `auth.source.realm`.
