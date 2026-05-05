# PostKit CLI — Architecture

System architecture and design decisions for the PostKit modular CLI toolkit.

---

## Overview

PostKit is a modular CLI toolkit built with **TypeScript** and **Node.js** that provides developer tools for database migrations and Keycloak auth management. It uses a **plugin module architecture** where each feature is self-contained.

```
┌─────────────────────────────────────────────────────────┐
│                     postkit (CLI)                        │
│                     cli/src/index.ts                     │
├──────────┬──────────────────────────┬───────────────────┤
│   init   │       db module          │    auth module     │
│ command  │   (migrations, import)   │  (Keycloak sync)  │
├──────────┴──────────────────────────┴───────────────────┤
│                  common layer                            │
│     config · logger · shell · types · init-check        │
└─────────────────────────────────────────────────────────┘
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
- **Session state** — Tracked in `.postkit/db/session.json`
- **Named remotes** — Multiple remote DBs via `db.remotes` in config
- **Schema directory** — User-maintained SQL files (`db/schema/`) with sections: `infra/`, `extensions/`, `types/`, `enums/`, `tables/`, `views/`, `functions/`, `triggers/`, `grants/`, `seeds/`

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

---

## Common Layer

Shared utilities used by all modules, located in `cli/src/common/`:

| File | Purpose |
|------|---------|
| `config.ts` | Config loader (`.env`, `postkit.config.json`), path resolution |
| `logger.ts` | Chalk-based console output (respects `--verbose`) |
| `shell.ts` | Shell command execution wrapper |
| `types.ts` | Shared TypeScript types (`CommandOptions`) |
| `init-check.ts` | Project initialization validation |

---

## Configuration

Loaded from `postkit.config.json` via `loadPostkitConfig()`:

```json
{
  "db": {
    "localDbUrl": "postgres://...",
    "schemaPath": "db/schema",
    "schema": "public",
    "remotes": {
      "dev": { "url": "postgres://...", "default": true },
      "staging": { "url": "postgres://..." }
    }
  },
  "auth": {
    "sourceKeycloak": { "baseUrl": "...", "realm": "..." },
    "targetKeycloak": { "baseUrl": "...", "realm": "..." }
  }
}
```

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
│   └── auth/
├── e2e/              # End-to-end tests
│   ├── smoke/        # Quick tests (no Docker)
│   ├── workflows/    # Full workflow tests
│   └── error-handling/  # Error scenario tests
└── helpers/          # Shared test utilities (mock-config, mock-shell, etc.)
```

---

## Runtime Directory Structure

All PostKit runtime files in `.postkit/` (gitignored):

```
.postkit/
├── db/
│   ├── session.json         # Current session state
│   ├── committed.json       # Committed migration tracking
│   ├── plan.sql             # Generated migration plan
│   ├── schema.sql           # Generated schema from files
│   ├── session/             # Session migrations (temporary)
│   └── migrations/          # Committed migrations (for deploy)
└── auth/
    └── raw/                 # Exported realm config (pre-clean)
```
