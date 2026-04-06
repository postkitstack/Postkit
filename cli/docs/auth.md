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
│                           │ .postkit/auth/raw │                    │
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
│                           │ .postkit/auth/    │                    │
│                           │    realm/         │                    │
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

Configure in `postkit.config.json`:

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

### Required Fields

| Field | Description |
|-------|-------------|
| `auth.source.url` | Source Keycloak base URL |
| `auth.source.adminUser` | Source admin username |
| `auth.source.adminPass` | Source admin password |
| `auth.source.realm` | Realm name to export |
| `auth.target.url` | Target Keycloak base URL |
| `auth.target.adminUser` | Target admin username |
| `auth.target.adminPass` | Target admin password |

### Optional Fields

| Field | Description | Default |
|-------|-------------|---------|
| `auth.configCliImage` | Docker image for import | `adorsys/keycloak-config-cli:6.4.0-24` |

---

## 🚀 Commands

### `postkit auth export`

Export realm from source Keycloak, clean it, and save to disk.

```bash
postkit auth export
postkit auth export --force    # Skip confirmation
```

**Options:**

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |

**What it does:**
1. Authenticates with source Keycloak (admin token via REST API)
2. Exports realm config via partial-export API
3. Saves raw export to `.postkit/auth/raw/{realm}.json`
4. Cleans config (strips IDs, secrets, keys, credentials)
5. Saves cleaned config to `.postkit/auth/realm/{realm}.json`

---

### `postkit auth import`

Import cleaned realm config to target Keycloak via `keycloak-config-cli` Docker container.

```bash
postkit auth import
postkit auth import --force    # Skip confirmation
```

**Options:**

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |

**Requires:** Docker running, cleaned config file present (run `export` first).

---

### `postkit auth sync`

Full sync — export from source then import to target, in sequence.

```bash
postkit auth sync
postkit auth sync --force    # Skip all confirmations
```

**Options:**

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |

---

## 📂 Output Structure

```
.postkit/
└── auth/
    ├── raw/
    │   └── {realm}.json      # Raw export from source
    └── realm/
        └── {realm}.json      # Cleaned config for import
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
