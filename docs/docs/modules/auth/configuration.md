---
sidebar_position: 10
---

# Auth Configuration

The auth module uses environment variables for Keycloak connections. Set these in your `.env` file.

## Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `KC_SOURCE_URL` | Source Keycloak base URL | `https://keycloak-dev.example.com` |
| `KC_SOURCE_ADMIN_USER` | Source admin username | `admin` |
| `KC_SOURCE_ADMIN_PASS` | Source admin password | `password123` |
| `KC_SOURCE_REALM` | Realm name to export | `myapp-realm` |
| `KC_TARGET_URL` | Target Keycloak base URL | `https://keycloak-staging.example.com` |
| `KC_TARGET_ADMIN_USER` | Target admin username | `admin` |
| `KC_TARGET_ADMIN_PASS` | Target admin password | `password123` |

## Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RAW_EXPORT_DIR` | Raw export directory | `.tmp-config` |
| `CLEAN_OUTPUT_DIR` | Cleaned output directory | `realm-config` |
| `OUTPUT_FILENAME` | Output filename | `pro-application-realm.json` |
| `KC_CONFIG_CLI_IMAGE` | Docker image for import | `adorsys/keycloak-config-cli:6.4.0-24` |

## Example .env File

```bash
# Source Keycloak
KC_SOURCE_URL=https://keycloak-dev.example.com
KC_SOURCE_ADMIN_USER=admin
KC_SOURCE_ADMIN_PASS=dev-password
KC_SOURCE_REALM=myapp-realm

# Target Keycloak
KC_TARGET_URL=https://keycloak-staging.example.com
KC_TARGET_ADMIN_USER=admin
KC_TARGET_ADMIN_PASS=staging-password

# Optional
RAW_EXPORT_DIR=.tmp-config
CLEAN_OUTPUT_DIR=realm-config
OUTPUT_FILENAME=myapp-realm.json
```
