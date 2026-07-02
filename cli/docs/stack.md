# 📦 Stack Module (`postkit stack`)

A local backend stack manager. Starts and manages Postgres, Keycloak, PostgREST, and Traefik as a Docker Compose project, applies DB migrations on startup, and handles Keycloak realm initialization automatically on the first run.

---

## 🗂️ Services Overview

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | `postgres:16-alpine` | 25432 (host) | Database |
| `keycloak` | `quay.io/keycloak/keycloak:26.6` | via Traefik | Auth server (`keycloak.localhost`) |
| `postgrest` | `postgrest/postgrest:latest` | via Traefik | REST API (`api.localhost`) |
| `traefik` | `traefik:v3.3` | 80 (HTTP) / 8080 (dashboard) | Reverse proxy |

All services share a Docker network named `postkit-net`. The network name is explicit (no Docker Compose project prefix) so external containers like `keycloak-config-cli` can join it by name.

**Dependency rule:** Selecting `keycloak` or `postgrest` automatically includes `postgres` and `traefik`.

---

## 🚀 `stack up` — Two-Phase Startup

`stack up` enforces an ordered startup sequence: the database must be initialized before auth/API services start.

```
┌────────────────────────────────────────────────────────────────────┐
│                       stack up (two-phase)                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1 — Infrastructure                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Start: postgres + traefik                                     │  │
│  │ Wait:  health checks (pg_isready, Traefik API)                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  Phase 2 — DB Initialization  (hard failure stops stack up)         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 1. connectWithRetry → CREATE SCHEMA IF NOT EXISTS postkit     │  │
│  │    + CREATE TABLE IF NOT EXISTS postkit.stack_config          │  │
│  │ 2. Apply db/infra/*.sql (roles, schemas, extensions)          │  │
│  │ 3. Run committed migrations (.postkit/db/migrations/)         │  │
│  │ 4. Apply seeds                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  Phase 3 — Application Services                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Start: keycloak + postgrest                                   │  │
│  │ Wait:  health checks (Keycloak /health, PostgREST /)          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  Phase 4 — Initial Setup  (first run only, skipped if initialized) │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ readStackIsInitial → true?                                    │  │
│  │   ├─▶ importRealmTemplate (keycloak-config-cli container)     │  │
│  │   ├─▶ fetchAndMergeKeys (JWKs + client secrets)              │  │
│  │   ├─▶ writeComposeFile + composeUp(postgrest)  [update JWT]  │  │
│  │   └─▶ setStackInitialized (is_initial = 'false' in DB)       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🔁 `is_initial` State Management

Whether to run realm import and JWKs fetch is controlled by a flag stored in the database itself — not in a file — so it resets automatically when the database volume is wiped.

| State | Location | Meaning |
|-------|----------|---------|
| Missing row (default) | `postkit.stack_config` table | First run — executes realm import + JWKs on next `stack up` |
| `value = 'false'` | `postkit.stack_config` table | Already initialized — Phase 4 is skipped |

**Automatic reset:** `postkit stack down --volumes` wipes the Postgres volume, which drops `postkit.stack_config`. The next `stack up` finds no row and runs full initialization again.

**Manual override:**
- `postkit stack realm` — re-import realm without wiping data
- `postkit stack keys` — re-fetch JWKs without wiping data

---

## 🔑 Keycloak Providers

Keycloak provider JARs are mounted at `/opt/keycloak/providers` inside the container. PostKit assembles the mount source directory at `postkit init` time from two sources:

| Source | Path | Notes |
|--------|------|-------|
| Bundled JARs | `vendor/providers/*.jar` (CLI) | Copied on `postkit init` |
| Project-specific JARs | `auth/providers/<name>/target/*.jar` | Copied on `postkit init` |

**Destination:** `.postkit/auth/providers/` — gitignored, rebuilt by `postkit init`.

If you add or update a project provider, re-run `postkit init` to sync the new JAR, then restart the stack.

---

## 🏰 Realm Template + JWT Role Mapper

On the first `stack up` (when `is_initial=true`), PostKit imports a Keycloak realm template.

The template path is configured via `stack.keycloak.realmTemplate` (default: `.postkit/auth/realm/postkit.json`). Scaffolded automatically by `postkit init`.

Before importing, `cleanRealmTemplate()` transforms the raw template JSON:

| Transform | Detail |
|-----------|--------|
| Set realm name | Sets `realm` to `config.keycloak.realm`, removes top-level `id` |
| Strip builtin clients | Removes `account`, `account-console`, `admin-cli`, `broker`, `realm-management`, `security-admin-console` |
| Strip generated fields | Removes `id`, `secret`, `registrationAccessToken`, `client.secret.creation.time` |
| Strip role IDs | Removes `id` from all realm roles |
| Ensure admin role | Adds `admin` realm role if absent |
| Inject JWT Role Mapper | Adds `script-primary-role.js` protocol mapper to every non-builtin client |

The **JWT Role Mapper** (`protocolMapper: "script-primary-role.js"`) maps Keycloak realm roles into JWT claims in the format expected by PostgREST for role-based access control.

Import runs via:
```
docker run --rm --network postkit-net \
  adorsys/keycloak-config-cli:latest-26
```
targeting `http://keycloak:8080` (internal Docker DNS, bypasses Traefik).

---

## ⚙️ Configuration

### `postkit.config.json` (committed)

```json
{
  "name": "myapp_a3f2b1c0",
  "db": {
    "schemaPath": "db/schema",
    "schemas": ["public"],
    "infraPath": "db/infra"
  },
  "auth": {
    "configCliImage": "adorsys/keycloak-config-cli:latest-26"
  },
  "stack": {
    "postgres": {
      "port": 25432,
      "database": "postkit",
      "pgVersion": 16
    },
    "keycloak": {
      "realm": "postkit",
      "realmTemplate": ".postkit/auth/realm/postkit.json",
      "clients": ["app"]
    },
    "postgrest": {
      "dbSchema": "public",
      "dbAnonRole": "anon"
    },
    "traefik": {
      "httpPort": 80,
      "dashboardPort": 8080
    },
    "network": "postkit-net"
  }
}
```

All `stack.*` fields are optional — defaults are applied for anything omitted.

### `postkit.secrets.json` (gitignored)

Auto-generated by `postkit stack up` on first run. Missing passwords are generated as random 32-byte hex strings.

```json
{
  "stack": {
    "postgres": {
      "user": "postgres",
      "password": "<auto-generated>"
    },
    "keycloak": {
      "adminUser": "admin",
      "adminPassword": "<auto-generated>"
    },
    "jwks": {
      "keys": [{ "kty": "oct", "kid": "storage-url-signing-key", "alg": "HS256", "k": "..." }],
      "urlSigningKey": { "kty": "oct", "kid": "storage-url-signing-key", "alg": "HS256", "k": "..." }
    }
  }
}
```

> JWKs and client secrets are populated here by `postkit stack keys` after being fetched from Keycloak.

### Config Properties Reference

| Property | File | Default | Description |
|----------|------|---------|-------------|
| `name` | config | required | Docker Compose project name — scopes containers per project |
| `stack.postgres.port` | config | 25432 | Host port mapped to Postgres container |
| `stack.postgres.database` | config | `postkit` | Database name |
| `stack.postgres.pgVersion` | config | 16 | Postgres major version |
| `stack.postgres.volume` | config | `postkit-pgdata` | Docker volume name for Postgres data |
| `stack.keycloak.realm` | config | `postkit` | Keycloak realm name |
| `stack.keycloak.realmTemplate` | config | `.postkit/auth/realm/postkit.json` | Path to realm template |
| `stack.keycloak.clients` | config | `[]` | Client names to fetch secrets for via `stack keys` |
| `stack.keycloak.volume` | config | `postkit-keycloak-data` | Docker volume name for Keycloak data |
| `stack.postgrest.dbSchema` | config | `public` | PostgREST exposed DB schema |
| `stack.postgrest.dbAnonRole` | config | `anon` | PostgREST anonymous role |
| `stack.traefik.httpPort` | config | 80 | Traefik HTTP entry point (host) |
| `stack.traefik.dashboardPort` | config | 8080 | Traefik dashboard port (host) |
| `stack.network` | config | `postkit-net` | Docker network name |
| `stack.postgres.password` | secrets | auto-generated | Postgres password |
| `stack.keycloak.adminPassword` | secrets | auto-generated | Keycloak admin password |

---

## 🚀 Commands

### `postkit stack up [services...]`

Start the full stack or selected services.

```bash
postkit stack up                          # Start all services
postkit stack up postgres traefik         # Start only postgres + traefik
postkit stack up postgres keycloak        # Includes traefik automatically
postkit stack up --no-wait               # Skip health check waiting
postkit stack up --no-keys               # Skip auto-fetching JWKs on init
```

Available service names: `postgres`, `keycloak`, `postgrest`, `traefik`

---

### `postkit stack down [--volumes]`

Stop and remove all stack containers.

```bash
postkit stack down             # Stop containers, keep volumes (data preserved)
postkit stack down --volumes   # Stop containers AND delete volumes (resets is_initial)
```

> Without `--volumes`, Postgres and Keycloak data survive in Docker named volumes. Use `--volumes` for a clean slate — this also resets the `is_initial` flag so the next `stack up` re-runs realm import and JWKs fetch.

---

### `postkit stack status`

Show running services, ports, and health status.

```bash
postkit stack status
```

---

### `postkit stack logs [service] [-f] [-n <number>]`

Tail logs for all services or a specific service.

```bash
postkit stack logs                        # Follow all services (default)
postkit stack logs keycloak               # Keycloak logs only
postkit stack logs postgres --no-follow   # Print last 100 lines and exit
postkit stack logs postgrest -n 50        # Last 50 lines, then follow
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `-f, --follow` | true | Stream logs continuously |
| `--no-follow` | — | Print last N lines and exit |
| `-n, --tail <number>` | 100 | Number of lines to show |

---

### `postkit stack restart [services...]`

Restart one or more services. Service names are validated before restarting.

```bash
postkit stack restart                     # Restart all services
postkit stack restart keycloak            # Restart keycloak only
postkit stack restart keycloak postgrest  # Restart multiple services
```

Invalid service names produce an error listing valid options (`postgres`, `keycloak`, `postgrest`, `traefik`).

---

### `postkit stack keys [--restart] [--clients <names>]`

Fetch JWKs and client secrets from Keycloak and write them to `postkit.secrets.json`. Optionally restarts PostgREST with the updated JWT configuration.

```bash
postkit stack keys                        # Fetch and write to secrets
postkit stack keys --restart              # Fetch + restart PostgREST
postkit stack keys --clients "app,admin"  # Fetch keys for specific clients only
```

---

### `postkit stack realm`

Re-import the Keycloak realm template without restarting the stack.

```bash
postkit stack realm
```

Runs `cleanRealmTemplate()` + `importRealmTemplate()` — the same steps as Phase 4 of `stack up`. Use this after editing the realm template or when Keycloak loses its configuration.

---

## 📋 Workflow Guide

### First Run

```bash
# 1. Initialize the project (creates infra SQL, realm template, providers)
postkit init

# 2. Start the full stack
#    Phase 1: postgres + traefik start and become healthy
#    Phase 2: infra SQL + migrations + seeds applied
#    Phase 3: keycloak + postgrest start and become healthy
#    Phase 4: realm imported, JWKs fetched, postgrest restarted
postkit stack up

# Stack is running:
#   Keycloak:   http://keycloak.localhost
#   API:        http://api.localhost
#   DB:         postgres://postgres:***@localhost:25432/postkit
#   Dashboard:  http://localhost:8080/dashboard/
```

### Subsequent Runs

```bash
# Phase 4 is skipped (is_initial=false in DB)
postkit stack up

# Check health
postkit stack status

# Tail logs
postkit stack logs

# Stop (keep data)
postkit stack down
```

### After Schema Changes

Schema changes are applied automatically on the next `stack up` (Phase 2 runs committed migrations every time). If the stack is already running:

```bash
# Deploy schema changes to the running stack DB
postkit db deploy
```

### Full Reset

```bash
# Wipe all data + volumes, reset is_initial flag
postkit stack down --volumes

# Next up runs full initialization again
postkit stack up
```

### Re-importing the Realm Only

```bash
# Edit .postkit/auth/realm/postkit.json
# Then re-import without restarting services
postkit stack realm
```

---

## 🔧 PostKit Directory Structure

```
.postkit/
├── auth/
│   ├── realm/
│   │   └── postkit.json       # COMMITTED — realm template (scaffolded by init)
│   └── providers/             # GITIGNORED — Keycloak JARs (vendor + project)
│       └── *.jar
└── stack/
    └── docker-compose.yml     # GITIGNORED — generated compose file (regenerated on stack up)
```

The compose file is regenerated every time `stack up` runs from the current config. Never edit it manually — changes will be overwritten.

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `Docker not found` | Install Docker Desktop; ensure `docker` is on your PATH |
| `docker compose` not available | Install Docker Compose V2 (bundled with Docker Desktop 4.x+) |
| `Config file not found` / `not initialized` | Run `postkit init` before any stack command |
| `Invalid stack configuration` | Check `stack.*` fields in `postkit.config.json` against the Config Properties table |
| Keycloak `Broken pipe` or connection refused during realm import | Keycloak is still starting. Run `postkit stack logs keycloak` and wait for the startup message, then run `postkit stack realm` |
| PostgREST returns 401 after `stack keys` | JWT secret mismatch — run `postkit stack keys --restart` to sync JWKs and restart PostgREST |
| `keycloak-config-cli import failed` | Check `postkit stack logs keycloak` for startup errors. Verify realm template JSON is valid |
| Stack starts but Keycloak has DB errors | Ensure `db/infra/002_schemas.sql` creates the `auth` schema (`CREATE SCHEMA IF NOT EXISTS auth`) — applied in Phase 2 before Keycloak starts |
| `Unknown service: "<name>"` | Valid names are: `postgres`, `keycloak`, `postgrest`, `traefik` |
| Ports already in use (25432, 80, 8080) | Override ports in `postkit.config.json` under `stack.postgres.port`, `stack.traefik.httpPort`, `stack.traefik.dashboardPort` |
| Provider JARs not loaded by Keycloak | Re-run `postkit init` to copy JARs to `.postkit/auth/providers/`, then `postkit stack down && postkit stack up` |
| `stack up` hangs at health check | Run `postkit stack logs` — Keycloak takes 30–60s on first boot. Health check timeout is 120s |
| `postkit stack down --volumes` does not reset realm | The reset is automatic because the `postkit.stack_config` table lives in the Postgres volume. If Keycloak volume was wiped but not Postgres, run `postkit stack realm` manually |
