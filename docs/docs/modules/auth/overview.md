---
sidebar_position: 1
---

# Auth Module

The `auth` module provides **Keycloak realm configuration management** — export, clean, and import realm configs between Keycloak instances.

## Workflow

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

## Commands

| Command | Description |
|---------|-------------|
| [`export`](/docs/modules/auth/commands/export) | Export realm from source Keycloak |
| [`import`](/docs/modules/auth/commands/import) | Import realm config to target Keycloak |
| [`sync`](/docs/modules/auth/commands/sync) | Export from source then import to target |

## Prerequisites

- **Docker** — Required for `postkit auth import` (runs `keycloak-config-cli`)
- Network access to source and target Keycloak instances

## Configuration

The auth module is configured in `postkit.config.json`. See [Auth Configuration](/docs/modules/auth/configuration) for details.

## Output Structure

```
.postkit/
└── auth/
    ├── raw/
    │   └── {realm}.json      # Raw export from source
    └── realm/
        └── {realm}.json      # Cleaned config for import
```

## What Gets Cleaned

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
