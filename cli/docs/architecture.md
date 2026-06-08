# PostKit CLI — Architecture

System architecture and design decisions for the PostKit modular CLI toolkit.

---

## Overview

PostKit is a modular CLI toolkit built with **TypeScript** and **Node.js** that provides developer tools for database migrations and Keycloak auth management. It uses a **plugin module architecture** where each feature is self-contained.

```
┌───────────────────────────────────────────────────────────────────────┐
│                          postkit (CLI)                                 │
│                          cli/src/index.ts                              │
├──────────┬────────────────────┬──────────────────┬────────────────────┤
│   init   │     db module      │   auth module    │   stack module     │
│ command  │ (migrations,import)│ (Keycloak sync)  │ (local dev stack)  │
├──────────┴────────────────────┴──────────────────┴────────────────────┤
│                         common layer                                   │
│          config · logger · shell · types · init-check                  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Module System

Each module is registered via `register<Name>Module(program: Command)` in `cli/src/index.ts`. Modules are self-contained with a consistent internal structure:

```
modules/<name>/
├── index.ts        # Module registration (commands → commander)
├── commands/       # Command handlers (thin layer, call services)
├── services/       # Core business logic
├── utils/          # Module-specific utilities
└── types/          # TypeScript interfaces
```

**Dependency direction** (strict, no cycles):
```
commands → services → utils
    ↓          ↓
  common (config, logger, shell, types)
```

### Adding a New Module

1. Create directory under `cli/src/modules/<name>/`
2. Export `register<Name>Module(program)` from `index.ts`
3. Import and call in `cli/src/index.ts`
4. Commands use `withInitCheck()` wrapper for initialized-project validation

---

## Modules

### Database Module (`postkit db`)

**Registration**: `registerDbModule()` in `cli/src/modules/db/index.ts`
**Docs**: `cli/docs/db.md`

Session-based migration workflow: `start → plan → apply → commit → deploy`

```
┌──────────┐    ┌──────┐    ┌───────┐    ┌────────┐    ┌────────┐
│  start   │───▶│ plan │───▶│ apply │───▶│ commit │───▶│ deploy │
│ (clone)  │    │(diff)│    │(local)│    │(stage) │    │(remote)│
└──────────┘    └──────┘    └───────┘    └────────┘    └────────┘
```

**Key components:**
- **pgschema** — Bundled binary for schema diffing (`vendor/pgschema/`)
- **dbmate** — npm-installed migration runner (`--migrations-table postkit.schema_migrations`)
- **Session state** — Tracked in `.postkit/db/session.json`; includes optional `containerID` when auto Docker container is active
- **Named remotes** — Multiple remote DBs via `db.remotes`; all remote data (url, default, addedAt) stored entirely in `postkit.secrets.json`
- **Auto Docker container** — When `localDbUrl` is empty, `container.ts` starts a `postgres:{version}-alpine` container. Version is queried from remote via `SHOW server_version_num`. `pg_dump`/`psql` run inside the container via `docker exec` for version-matched tools.
- **Infra directory** — DB-level objects (roles, extensions, `CREATE SCHEMA`) in `db/infra/`; applied before any schema DDL on every `apply` and `deploy`
- **Schema directories** — Per-schema SQL under `db/schema/<name>/` with sections: `extensions/`, `types/`, `enums/`, `tables/`, `views/`, `functions/`, `triggers/`, `grants/`, `seeds/`. Multiple schemas are declared via `schemas: string[]` in config; array position = execution order

**Import sub-workflow** (`postkit db import`):
1. pg_dump source → pgschema `dump --multi-file` → normalize → generate baseline via pgschema plan → apply locally → sync migration state

### Auth Module (`postkit auth`)

**Registration**: `registerAuthModule()` in `cli/src/modules/auth/index.ts`
**Docs**: `cli/docs/auth.md`

Keycloak realm configuration management: `export → clean → import`

```
┌──────────┐    ┌───────┐    ┌────────┐
│  export  │───▶│ clean │───▶│ import │
│ (source) │    │(strip)│    │(target)│
└──────────┘    └───────┘    └────────┘
```

### Stack Module (`postkit stack`)

**Registration**: `registerStackModule()` in `cli/src/modules/stack/index.ts`
**Docs**: `cli/docs/stack.md`

Local backend stack management via Docker Compose: `up → (init) → keys → down`

```
┌────────────────────────────────────────────────────────────────────┐
│                       stack up (two-phase)                          │
├────────────────────────────────────────────────────────────────────┤
│  Phase 1: postgres + traefik                                        │
│           └─▶ waitForAllServices (health checks)                    │
│  Phase 2: applyStackDeploy (infra SQL + migrations + seeds)         │
│  Phase 3: keycloak + postgrest                                      │
│           └─▶ waitForAllServices                                    │
│  Phase 4: if is_initial=true:                                       │
│           └─▶ importRealmTemplate → fetchAndMergeKeys               │
│               └─▶ writeComposeFile → composeUp (postgrest)          │
│               └─▶ setStackInitialized (is_initial=false)            │
└────────────────────────────────────────────────────────────────────┘
```

**Architectural decisions:**

- **DB-backed initialization state**: `is_initial` is stored in `postkit.stack_config` table (not a file) so it resets automatically when volumes are wiped with `stack down --volumes`. No manual cleanup needed.
- **Two-phase boot**: `keycloak` and `postgrest` depend on schema/migrations being applied first. Starting them before `applyStackDeploy` completes causes startup failures. The stack module enforces this ordering explicitly rather than relying on Docker Compose `depends_on` health checks alone.
- **Provider sync at init time**: Keycloak provider JARs are copied to `.postkit/auth/providers/` during `postkit init` (not at startup) so the mount path exists before the container starts. Two sources: `vendor/providers/` (bundled) and `auth/providers/<name>/target/` (project-specific).
- **Realm import via keycloak-config-cli**: Import runs `docker run --network postkit-net adorsys/keycloak-config-cli` against the internal container name (`keycloak:8080`), not the Traefik hostname. This allows realm import to complete without Traefik being the entry point.
- **JWT Role Mapper injection**: `cleanRealmTemplate()` injects the `script-primary-role.js` protocol mapper into every non-builtin client automatically, so every client in the realm gets consistent role claim behavior without manual configuration.
- **Project name scoping**: `postkit.config.json` `name` field is used as the Docker Compose project name, ensuring container names and network names are isolated per project on the same machine.

---

## Multi-Schema Support

PostKit supports managing multiple PostgreSQL schemas within a single project. Schemas are declared as an ordered array in config:

```json
{ "db": { "schemas": ["public", "app"] } }
```

**Array order is execution order.** Schemas that others depend on must appear first.

### Directory layout

```
db/
├── infra/                  # DB-level objects: roles, extensions, CREATE SCHEMA
│   ├── 001_roles.sql
│   ├── 002_extensions.sql
│   └── 003_schemas.sql
└── schema/
    ├── public/             # Schema: "public"
    │   ├── tables/
    │   ├── functions/
    │   └── seeds/
    └── app/                # Schema: "app"
        ├── tables/
        ├── triggers/       # may call public.fn() — fully qualified
        └── seeds/
```

`db/infra/` holds DB-level objects (roles, extensions, `CREATE SCHEMA`) that belong to no single schema. It is applied first on every `apply` and `deploy`. Per-schema objects live under `db/schema/<name>/`.

### How `plan` works across schemas

`postkit db plan` loops over `config.schemas` in array order:
1. Generate `schema_<name>.sql` from `db/schema/<name>/`
2. Run `pgschema plan --schema <name>` → `plan_<name>.sql`
3. Apply `plan_<name>.sql` to the local DB immediately (intermediate apply — not a real migration)

Step 3 is critical: it makes schema `<name>`'s objects live in the local DB before the next schema is planned, so cross-schema references resolve correctly at plan time.

### How `apply` combines plans

`postkit db apply` wraps each per-schema plan with `SET search_path TO "<name>"` and combines them into a single dbmate migration file:

```sql
SET search_path TO "public";
-- public DDL ...

SET search_path TO "app";
-- app DDL ...
```

Seeds are applied per schema in array order after the migration runs.

### Cross-schema references

Use fully qualified names (`public.fn()`, `REFERENCES public.users(id)`). The referenced schema must appear earlier in the `schemas` array. The owner schema holds the SQL file:

- trigger on `app.orders` calling `public.audit_fn()` → file lives in `db/schema/app/triggers/`

For operations pgschema cannot model (e.g., atomically renaming a function and updating all callers across schemas), use `postkit db migration <name>` to create a manual migration that bypasses pgschema entirely.

### Backward compatibility

If `db/schema/<name>/` subdirectory does not exist but `db/schema/` contains files directly (flat layout), PostKit falls back to the flat layout. Existing single-schema projects work without file changes; `"schemas": ["public"]` is the default when `schemas` is unset.

---

## Common Layer

Shared utilities used by all modules, located in `cli/src/common/`:

| File | Purpose |
|------|---------|
| `config.ts` | Config loader — merges `postkit.config.json` + `postkit.secrets.json`, path resolution |
| `logger.ts` | Chalk-based console output (respects `--verbose`) |
| `shell.ts` | Shell command execution wrapper |
| `types.ts` | Shared TypeScript types (`CommandOptions`) |
| `init-check.ts` | Project initialization validation |

### DB Module Shared Utilities

Key shared utilities within the `db` module (used by multiple commands):

| File | Purpose |
|------|---------|
| `utils/json-file.ts` | `readJsonFile<T>()` / `writeJsonFile()` — typed JSON read/write |
| `utils/apply-target.ts` | `resolveApplyTarget(target?)` — resolves `local` or `remote` for infra/seed commands |
| `utils/session.ts` | `requireActiveSession()`, `assertLocalConnection(session, spinner)` |
| `services/prerequisites.ts` | `checkDbPrerequisites(verbose)` — verifies pgschema + dbmate are available |
| `services/database.ts` | `withPgClient<T>(url, fn)` — scoped pg client wrapper |
| `services/container.ts` | `resolveLocalDb(localDbUrl, remoteUrl, spinner, spinnerText?)` — starts auto Docker container when `localDbUrl` is empty; fetches PG version from `remoteUrl` internally |

---

## Configuration

Loaded via `loadPostkitConfig()`, which deep-merges two files:

| File | Committed | Contains |
|------|-----------|---------|
| `postkit.config.json` | Yes | Non-sensitive project settings (schema paths, flags) |
| `postkit.secrets.json` | No (gitignored) | Credentials + all remote config (URLs, names, defaults) |

```json
// postkit.config.json (committed — no remotes)
{
  "name": "myapp_a3f2b1c0",
  "db": {
    "infraPath": "db/infra",
    "schemaPath": "db/schema",
    "schemas": ["public", "app"]
  },
  "auth": { "configCliImage": "adorsys/keycloak-config-cli:latest-26" },
  "stack": {
    "keycloak": { "realmTemplate": ".postkit/auth/realm/postkit.json" }
  }
}

// postkit.secrets.json (gitignored — all credentials live here)
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "remotes": {
      "dev": { "url": "postgres://user:pass@dev-host:5432/myapp", "default": true, "addedAt": "2024-12-31T10:00:00.000Z" },
      "staging": { "url": "postgres://user:pass@staging-host:5432/myapp" }
    }
  },
  "stack": {
    "postgres": { "user": "postgres", "password": "<generated>" },
    "keycloak": { "adminUser": "admin", "adminPassword": "<generated>" }
  }
}
```

**`name`** — Project identifier used as the Docker Compose project name. Generated as `<slug>_<8hexchars>` by `postkit init`. Ensures container and network names are scoped per project.

**`schemas`** — Ordered array of schema names (`["public"]` by default). Array position determines execution order; schemas that other schemas depend on must appear first. Backward compat: `"schemas": ["public"]` with a flat `db/schema/` layout (no `db/schema/public/` subdirectory) continues to work unchanged.

**`infraPath`** — Path to the DB-level infra directory (roles, extensions, `CREATE SCHEMA`). Defaults to `"db/infra"`.

**`stack.*`** — Stack service configuration. All service images, ports, volumes, and realm template path. Service credentials (passwords, admin user) live in `postkit.secrets.json` under `stack.*`.

`localDbUrl` can be empty — PostKit will automatically start a Docker container (`postgres:{version}-alpine`) for the session. The container image version is detected from the remote database at runtime via `SHOW server_version_num`.

---

## Binary Resolution

PostKit bundles platform-specific binaries — no separate installation required:

| Binary | Location | Purpose |
|--------|----------|---------|
| pgschema | `vendor/pgschema/pgschema-{platform}-{arch}` | Schema diffing and multi-file dump |
| dbmate | npm package `dbmate` | SQL migration execution |

Supported platforms: `darwin-arm64`, `darwin-amd64`, `linux-arm64`, `linux-amd64`, `windows-arm64`, `windows-amd64`

---

## Build System

- **tsup** — Bundles TypeScript to ESM (Node 18+ target)
- **tsx** — Direct TypeScript execution for development
- Output: `cli/dist/index.js` with shebang for CLI execution

```bash
npm run build     # Production build
npm run dev -- <module> <command>  # Development mode
```

---

## Testing

- **Unit tests**: Vitest with `vi.mock()` for dependency isolation
- **E2E tests**: Black-box testing of compiled binary against real PostgreSQL (testcontainers)
- See `cli/docs/e2e-testing.md` for full testing guide

```
cli/test/
├── common/           # Unit tests for common utilities
├── modules/          # Unit tests for module services/utils
│   ├── db/
│   ├── auth/
│   └── stack/        # Stack module unit tests (compose, realm-init, scaffold, sync-providers, db-init, stack-config, stack-state, restart)
├── e2e/              # End-to-end tests
│   ├── smoke/        # Quick tests (no Docker) — includes stack-commands.test.ts
│   ├── workflows/    # Full workflow tests — includes stack-init-workflow.test.ts
│   └── error-handling/  # Error scenario tests — includes stack-config-errors.test.ts
└── helpers/          # Shared test utilities (mock-config, mock-shell, etc.)
```

---

## Runtime Directory Structure

PostKit files in `.postkit/` are split between gitignored (ephemeral/user-specific) and committed (shared with team):

```
.postkit/
├── db/
│   ├── session.json         # GITIGNORED — active session state, local DB URL, container ID
│   ├── plan_public.sql      # GITIGNORED — generated migration diff for "public" schema (ephemeral)
│   ├── plan_app.sql         # GITIGNORED — generated migration diff for "app" schema (ephemeral)
│   ├── schema_public.sql    # GITIGNORED — generated schema artifact for "public" (ephemeral)
│   ├── schema_app.sql       # GITIGNORED — generated schema artifact for "app" (ephemeral)
│   ├── session/             # GITIGNORED — temporary in-progress migrations
│   ├── committed.json       # COMMITTED — migration tracking index (shared)
│   └── migrations/          # COMMITTED — committed SQL migrations for deploy (shared)
├── auth/
│   ├── raw/                 # COMMITTED — auth raw config (shared)
│   ├── realm/               # COMMITTED — auth realm config (shared)
│   └── providers/           # GITIGNORED — Keycloak JARs (vendor + project), mounted into container
└── stack/
    └── docker-compose.yml   # GITIGNORED — generated compose file (ephemeral, regenerated on stack up)
```

`.gitignore` (written by `postkit init`) covers only the ephemeral paths:
- `.postkit/db/session.json`
- `.postkit/db/plan_*.sql`
- `.postkit/db/schema_*.sql`
- `.postkit/db/session/`
- `.postkit/auth/providers/`
- `.postkit/stack/`
- `postkit.secrets.json`
