# 🔐 Auth Module (`postkit auth`)

Keycloak realm configuration management — export, clean, and import realm configs between Keycloak instances.

---

## 🔄 Workflow

```
┌──────────────────────────────────────────────────────────────────┐
│                    KEYCLOAK REALM SYNC                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  $ postkit auth export                                            │
│  ┌──────────────────┐     ┌──────────────────┐                    │
│  │ 1. Get admin     │     │ 2. Export realm   │                    │
│  │    token (API)   │────▶│    via REST API   │                    │
│  └──────────────────┘     └────────┬─────────┘                    │
│                                    │                              │
│                           ┌────────▼─────────┐                    │
│                           │ 3. Save raw to    │                    │
│                           │    .tmp-config/   │                    │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                           ┌────────▼─────────┐                    │
│                           │ 4. Clean config   │                    │
│                           │    (strip IDs,    │                    │
│                           │    secrets, keys) │                    │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                           ┌────────▼─────────┐                    │
│                           │ 5. Save cleaned   │                    │
│                           │    to realm-config│                    │
│                           └──────────────────┘                    │
│                                                                   │
│  $ postkit auth import                                            │
│  ┌──────────────────┐     ┌──────────────────┐                    │
│  │ 6. Read cleaned  │     │ 7. Import via     │                    │
│  │    realm config  │────▶│    keycloak-      │                    │
│  │                  │     │    config-cli     │                    │
│  └──────────────────┘     └──────────────────┘                    │
│                                                                   │
│  $ postkit auth sync   = export + import                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🧰 Prerequisites

- **Docker** — Required for `postkit auth import` (runs `keycloak-config-cli`)
- **Network access** to source and target Keycloak instances

---

## ⚙️ Configuration

Set these in your `.env` file:

| Variable | Description | Required |
|----------|-------------|----------|
| `KC_SOURCE_URL` | Source Keycloak base URL | Yes |
| `KC_SOURCE_ADMIN_USER` | Source admin username | Yes |
| `KC_SOURCE_ADMIN_PASS` | Source admin password | Yes |
| `KC_SOURCE_REALM` | Realm name to export | Yes |
| `KC_TARGET_URL` | Target Keycloak base URL | Yes |
| `KC_TARGET_ADMIN_USER` | Target admin username | Yes |
| `KC_TARGET_ADMIN_PASS` | Target admin password | Yes |
| `RAW_EXPORT_DIR` | Raw export directory | No (default: `.tmp-config`) |
| `CLEAN_OUTPUT_DIR` | Cleaned output directory | No (default: `realm-config`) |
| `OUTPUT_FILENAME` | Output filename | No (default: `pro-application-realm.json`) |
| `KC_CONFIG_CLI_IMAGE` | Docker image for import | No (default: `adorsys/keycloak-config-cli:6.4.0-24`) |

---

## 🚀 Commands

### `postkit auth export`

Export realm from source Keycloak, clean it, and save to disk.

```bash
postkit auth export
postkit auth export --verbose
```

**What it does:**
1. Authenticates with source Keycloak (admin token via REST API)
2. Exports realm config via partial-export API
3. Saves raw export to `.tmp-config/`
4. Cleans config (strips IDs, secrets, keys, credentials)
5. Saves cleaned config to `realm-config/`

---

### `postkit auth import`

Import cleaned realm config to target Keycloak via `keycloak-config-cli` Docker container.

```bash
postkit auth import
```

**Requires:** Docker running, cleaned config file present (run `export` first).

---

### `postkit auth sync`

Full sync — export from source then import to target, in sequence.

```bash
postkit auth sync
```

---

## 📋 Typical Workflow

```bash
# Export from source, clean, and import to target
postkit auth sync

# Or step by step:
postkit auth export   # Export + clean
postkit auth import   # Import to target
```

---

## 🧹 What Gets Cleaned

The cleaning process removes sensitive and environment-specific data:

- **IDs** — All `id` and `_id` fields
- **Container IDs** — All `containerId` fields
- **Users** — Entire users array
- **Client secrets** — `secret` from all clients
- **Key providers** — `org.keycloak.keys.KeyProvider` components
- **SMTP passwords** — `password` from `smtpServer`
- **IDP secrets** — `clientSecret` from identity providers
- **Storage credentials** — `bindCredential` from storage providers
- **Default role IDs** — `id` from `defaultRole`
