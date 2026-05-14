# PostKit Stack Module

The `stack` module manages a local Docker-based backend environment for development. It spins up **PostgreSQL**, **Keycloak**, and **PostgREST** as Docker containers — wired together on a shared network — using a generated `docker-compose.yml` that is written to `.postkit/stack/`.

---

## Prerequisites

- Docker Desktop installed and **running**
- Docker Compose V2 (included in Docker Desktop by default)

---

## Services

| Service | Default Image | Default Port | Purpose |
|---------|--------------|-------------|---------|
| **postgres** | `postgres:16-alpine` | `25432` | PostgreSQL database |
| **keycloak** | `quay.io/keycloak/keycloak:26.6` | `28080` | Auth / identity provider |
| **postgrest** | `postgrest/postgrest:latest` | `3000` | Auto REST API over Postgres |
| **traefik** | `traefik:v3.3` | `80` (HTTP) / `8080` (dashboard) | Reverse proxy + routing |

**Dependency rule**: Keycloak and PostgREST both depend on Postgres and Traefik. Starting either one automatically includes both.

### Traefik Routing

Traefik listens on port `80` and routes incoming requests by hostname:

| URL | Routes to | Service |
|-----|-----------|---------|
| `http://keycloak.localhost` | `:8080` | Keycloak |
| `http://api.localhost` | `:3000` | PostgREST |
| `http://localhost:8080/dashboard/` | — | Traefik dashboard |

Postgres is TCP and accessed directly on port `25432` — not routed through Traefik.

---

## Configuration

Stack config is split across two files:

### `postkit.config.json` (committed to git)

Non-sensitive settings — ports, images, database name, realm:

```json
{
  "stack": {
    "postgres": {
      "port": 25432,
      "pgVersion": 16,
      "database": "myapp",
      "image": "postgres:16-alpine",
      "volume": "postkit-pgdata"
    },
    "keycloak": {
      "port": 28080,
      "realm": "myrealm",
      "image": "quay.io/keycloak/keycloak:26.6",
      "volume": "postkit-keycloak-data"
    },
    "postgrest": {
      "port": 3000,
      "dbSchema": "public",
      "dbAnonRole": "anon"
    },
    "traefik": {
      "httpPort": 80,
      "dashboardPort": 8080,
      "image": "traefik:v3.3"
    },
    "network": "postkit-net"
  }
}
```

All fields are optional — defaults are used for anything omitted.

### `postkit.secrets.json` (gitignored)

Credentials only:

```json
{
  "stack": {
    "postgres": {
      "user": "myuser",
      "password": "..."
    },
    "keycloak": {
      "adminUser": "admin",
      "adminPassword": "..."
    },
    "postgrest": {
      "jwtSecret": "..."
    }
  }
}
```

**Auto-generation**: If passwords or the JWT secret are missing on first `stack up`, PostKit generates cryptographically random values and writes them into `postkit.secrets.json` automatically. You never need to set them manually.

---

## Commands

### `postkit stack up [services...]`

Start all services or a specific subset.

```bash
postkit stack up                        # Start all enabled services
postkit stack up postgres               # Postgres only
postkit stack up postgres keycloak      # Postgres + Keycloak + Traefik (auto)
postkit stack up traefik                # Traefik only
postkit stack up --no-wait              # Start without waiting for health checks
```

**What happens (step by step):**

```
1. Check Docker + Docker Compose V2 are available
2. Load config from postkit.config.json + postkit.secrets.json
3. Auto-generate any missing secrets → write to postkit.secrets.json
4. Resolve which services to start
   └─ If keycloak or postgrest selected → add postgres automatically
5. Generate docker-compose.yml → write to .postkit/stack/docker-compose.yml
6. Run: docker compose up -d <services>
7. Wait for health checks (unless --no-wait):
   └─ postgres  → TCP connection probe on port
   └─ keycloak  → HTTP GET http://localhost:<port>/
   └─ postgrest → HTTP GET http://localhost:<port>/
8. Print service summary table with URLs and ports
```

**Output after success:**

```
✔ Stack is running!

Service      URL                                          Port
──────────────────────────────────────────────────────────────────────
PostgreSQL   postgres://myuser:***@localhost:25432/myapp  25432
Keycloak     http://localhost:28080                       28080
PostgREST    http://localhost:3000                        3000
Traefik      http://localhost:8080/dashboard/             8080

Routing:
  http://keycloak.localhost  →  Keycloak
  http://api.localhost       →  PostgREST
```

---

### `postkit stack down [--volumes]`

Stop and remove all stack containers.

```bash
postkit stack down             # Stop containers, keep data volumes
postkit stack down --volumes   # Stop containers AND delete persistent data
```

**What happens:**

```
1. Check .postkit/stack/docker-compose.yml exists
   └─ Error if not found (stack was never started)
2. Run: docker compose down [--volumes]
3. Containers removed; volumes preserved unless --volumes passed
```

> **Data safety**: Without `--volumes`, PostgreSQL data and Keycloak data survive in Docker named volumes (`postkit-pgdata`, `postkit-keycloak-data`). Re-running `stack up` picks up where you left off. Use `--volumes` only when you want a clean slate.

---

### `postkit stack status`

Show the current state of all stack containers.

```bash
postkit stack status          # Human-readable table
postkit stack status --json   # Machine-readable JSON output
```

**Output:**

```
PostKit Stack Status

Service     Container           State    Health   Ports
────────────────────────────────────────────────────────
postgres    postkit-postgres    running  healthy  25432:5432
keycloak    postkit-keycloak    running  healthy  28080:8080
postgrest   postkit-postgrest   running           3000:3000
```

With `--json`, returns the raw `ServiceStatus[]` array:
```json
[
  {
    "name": "postkit-postgres",
    "service": "postgres",
    "state": "running",
    "health": "healthy",
    "ports": "25432:5432",
    "publisherPort": 25432
  }
]
```

**Error:** Throws if `.postkit/stack/docker-compose.yml` does not exist — run `stack up` first.

---

### `postkit stack logs [service]`

Tail logs from one or all services. Follows output by default (like `docker logs -f`).

```bash
postkit stack logs                      # Follow all services
postkit stack logs postgres             # Postgres logs only
postkit stack logs keycloak --no-follow # Print last 100 lines and exit
postkit stack logs postgrest -n 50      # Last 50 lines, then follow
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `-f, --follow` | `true` | Stream logs continuously |
| `--no-follow` | — | Print last N lines and exit |
| `-n, --tail <number>` | `100` | Number of lines to show |

Runs until you press `Ctrl+C`. Output is piped directly to your terminal (colour, formatting preserved).

---

### `postkit stack restart [service]`

Restart one service or all services. Waits for health checks after restart.

```bash
postkit stack restart             # Restart all services
postkit stack restart keycloak    # Restart Keycloak only
postkit stack restart postgres    # Restart Postgres only
```

**What happens:**

```
1. Check .postkit/stack/docker-compose.yml exists
2. Run: docker compose restart [service]
3. Wait for health checks on restarted service(s)
   └─ Non-fatal if still starting — warns and continues
```

---

## Full Workflow Example

```bash
# 1. Start everything for the first time
postkit stack up
# → Secrets auto-generated and saved to postkit.secrets.json
# → All three services start, health checks pass

# 2. Check what's running
postkit stack status

# 3. Watch Keycloak logs while configuring a realm
postkit stack logs keycloak

# 4. Restart PostgREST after changing db.dbAnonRole in config
postkit stack restart postgrest

# 5. End of day — stop containers but keep DB data
postkit stack down

# 6. Next day — pick up where you left off
postkit stack up

# 7. Full reset — delete all data and start fresh
postkit stack down --volumes
postkit stack up
```

---

## Internal File Layout

```
.postkit/
└── stack/
    └── docker-compose.yml    ← generated on every `stack up`, never committed
```

The compose file is **regenerated every time** `stack up` runs from the current config. You should never edit it manually — changes will be overwritten.

---

## How Health Checks Work

PostKit waits up to **120 seconds** for each service (60 attempts × 2 second delay):

| Service | Check type | What it probes |
|---------|-----------|---------------|
| postgres | TCP | Port reachable (`net.connect`) |
| keycloak | HTTP GET | `http://localhost:<port>/` — any response |
| postgrest | HTTP GET | `http://localhost:<port>/` — any response |
| traefik | HTTP GET | `http://localhost:<dashboardPort>/dashboard/` — any response |

All checks run in parallel. If any service does not become healthy in time, a warning is shown but the command does not fail — the stack may still be starting.

---

## Defaults Reference

| Setting | Default |
|---------|---------|
| Postgres image | `postgres:16-alpine` |
| Postgres port | `25432` |
| Postgres database | `postkit` |
| Postgres user | `postgres` |
| Postgres volume | `postkit-pgdata` |
| Keycloak image | `quay.io/keycloak/keycloak:26.6` |
| Keycloak port | `28080` |
| Keycloak realm | `postkit` |
| Keycloak volume | `postkit-keycloak-data` |
| PostgREST image | `postgrest/postgrest:latest` |
| PostgREST port | `3000` |
| PostgREST db schema | `public` |
| PostgREST anon role | `anon` |
| Traefik image | `traefik:v3.3` |
| Traefik HTTP port | `80` |
| Traefik dashboard port | `8080` |
| Docker network | `postkit-net` |
