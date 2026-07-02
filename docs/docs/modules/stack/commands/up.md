---
sidebar_position: 1
---

# stack up

Start the full stack or selected services.

## Usage

```bash
postkit stack up                        # Start all services
postkit stack up postgres traefik       # Start specific services
postkit stack up --no-wait              # Skip health check waiting
postkit stack up --no-keys              # Skip auto-fetching JWKs on init
```

## Arguments

| Argument | Description |
|----------|-------------|
| `[services...]` | Services to start: `postgres`, `keycloak`, `postgrest`, `traefik`. Omit for all. |

## Options

| Option | Description |
|--------|-------------|
| `--no-wait` | Skip waiting for health checks |
| `--no-keys` | Skip auto-fetching Keycloak JWKs during first-run initialization |

## What It Does

1. Checks Docker and Docker Compose availability
2. Loads config, auto-generates missing secrets (passwords, JWKs)
3. Generates `.postkit/stack/docker-compose.yml`
4. **Phase 1** — Starts `postgres` + `traefik`, waits for health checks
5. **Phase 2** — Applies `db/infra/` SQL, committed migrations, and seeds
6. **Phase 3** — Starts `keycloak` + `postgrest`, waits for health checks
7. **Phase 4** (first run only) — Imports realm template, fetches JWKs, restarts PostgREST

Phase 4 is skipped when `is_initial = false` in `postkit.stack_config`. It resets automatically after `stack down --volumes`.

## Dependency Rule

Selecting `keycloak` or `postgrest` automatically includes `postgres` and `traefik`.
