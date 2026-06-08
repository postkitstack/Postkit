---
sidebar_position: 2
---

# stack down

Stop and remove all stack containers.

## Usage

```bash
postkit stack down             # Stop containers, keep volumes
postkit stack down --volumes   # Stop containers AND remove volumes
```

## Options

| Option | Description |
|--------|-------------|
| `--volumes` | Remove persistent volumes (Postgres data, Keycloak data) |

## What It Does

1. Reads `.postkit/stack/docker-compose.yml`
2. Runs `docker compose down` (with `--volumes` if flag is set)

## Data Safety

Without `--volumes`, PostgreSQL and Keycloak data survive in Docker named volumes. Re-running `stack up` resumes where you left off.

With `--volumes`, all data is deleted and the `is_initial` flag resets automatically (the `postkit.stack_config` table is in the Postgres volume). The next `stack up` runs full initialization — realm import and JWKs fetch.
