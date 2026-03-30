# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Build the CLI for production
npm run build

# Run in development mode (direct TypeScript execution)
npm run dev -- <module> <command>
# Example: npm run dev -- db status

# Link globally for testing
npm link

# After linking, use directly
postkit <module> <command>
```

## Project Structure

PostKit is a modular CLI toolkit built with TypeScript and Node.js. The main code lives in the `cli/` directory.

```
cli/
├── src/
│   ├── index.ts              # Main CLI entry point using commander
│   ├── commands/             # Top-level commands (e.g., init)
│   ├── common/               # Shared utilities used by all modules
│   │   ├── config.ts         # Config loader (.env, postkit.config.json)
│   │   ├── logger.ts         # Chalk-based console output
│   │   ├── shell.ts          # Shell command execution wrapper
│   │   └── types.ts          # Shared TypeScript types
│   └── modules/              # Pluggable command modules
│       ├── db/               # Database migration module
│       │   ├── index.ts      # Module registration (registerDbModule)
│       │   ├── commands/     # Command handlers (start, plan, apply, commit, etc.)
│       │   ├── services/     # Core business logic (database, pgschema, dbmate)
│       │   ├── utils/        # DB-specific utilities (session, db-config)
│       │   └── types/        # DB module types
│       └── auth/             # Keycloak auth module
│           ├── index.ts      # Module registration (registerAuthModule)
│           ├── commands/     # export, import, sync
│           ├── services/     # Keycloak API, Docker importer
│           └── utils/        # Auth-specific config
├── vendor/                   # Bundled binaries (pgschema for all platforms)
├── dist/                     # Build output (generated)
├── package.json
└── tsup.config.ts            # Build configuration
```

## Architecture

### Module System

PostKit uses a modular plugin architecture. Each feature is implemented as a self-contained module:

1. **Module registration**: Each module exports a `register<Name>Module(program: Command)` function that registers its subcommands with the commander program.
2. **Command handlers**: Located in `modules/<name>/commands/`, each file exports a command handler function.
3. **Services**: Core business logic lives in `modules/<name>/services/` (e.g., database operations, external API calls).
4. **Utils**: Module-specific utilities in `modules/<name>/utils/`.

### Adding a New Module

Create a new directory under `cli/src/modules/<name>/` with:
- `index.ts` - Export `register<Name>Module(program)` function
- `commands/` - Command handler files
- `services/` - Business logic
- `utils/` - Module-specific utilities
- `types/` - TypeScript types (if needed)

Then import and call the registration function in `cli/src/index.ts`.

### Database Module Architecture

The `db` module implements a **session-based migration workflow**:

1. **Session state**: Tracked in `.postkit/session.json`. Used to ensure migrations are applied locally before remote.
2. **Binary resolution**: Both `pgschema` and `dbmate` binaries are auto-resolved:
   - `pgschema`: Bundled in `vendor/pgschema/` for all platforms (darwin-{arm64,amd64}, linux-{arm64,amd64}, windows-{arm64,amd64})
   - `dbmate`: npm-installed via the `dbmate` package
3. **Migration steps execution**: The `deploy` command uses `runSteps()` to execute multi-step operations with resume capability - if a step fails, re-running resumes from where it left off.
4. **Schema directory structure** (`db/schema/`):
   - `infra/` - Pre-migration (roles, schemas, extensions) - excluded from pgschema
   - `extensions/`, `types/`, `enums/`, `tables/`, etc. - pgschema-managed
   - `grants/` - Post-migration grants - excluded from pgschema
   - `seeds/` - Post-migration seed data - excluded from pgschema

### Configuration System

Config is loaded from two sources (in order):
1. `postkit.config.json` - Project-specific configuration (created by `postkit init`)
2. Environment variables (via dotenv)

Config is cached after first load. Use `loadPostkitConfig()` from `common/config.ts`.

Key config paths:
- `POSTKIT_CONFIG_FILE` = "postkit.config.json"
- `POSTKIT_DIR` = ".postkit" (session state, staged files)
- `vendor/` = Bundled binaries (resolved relative to CLI root, not project root)

### Build System

- **tsup** is used for bundling (ES modules only, Node 18+ target)
- **tsx** for development mode (direct TS execution without building)
- Output goes to `dist/` with a shebang banner for CLI execution

## Database Module Commands Reference

| Command | Purpose |
|---------|---------|
| `postkit db start` | Clone remote DB to local, start session |
| `postkit db plan` | Generate schema diff with pgschema |
| `postkit db apply` | Apply migration to local DB (creates dbmate migration) |
| `postkit db commit` | Apply staged migration to remote DB |
| `postkit db deploy --target=<env>` | Deploy migrations to environment (with dry-run verification) |
| `postkit db status` | Show session state |
| `postkit db abort` | Cancel session, cleanup local resources |
| `postkit db infra [--apply]` | Manage infra SQL (roles, schemas, extensions) |
| `postkit db grants [--apply]` | Regenerate and apply grants |
| `postkit db seed [--apply]` | Apply seed data |

## Common Patterns

### Command Handler Structure

Commands in `modules/*/commands/` follow this pattern:

```typescript
import type {CommandOptions} from "../../../common/types";

export async function someCommand(options: CommandOptions): Promise<void> {
  const config = loadPostkitConfig();
  // Business logic...
}
```

### Shell Command Execution

Use the `shell()` utility from `common/shell.ts` for running external commands (pg_dump, psql, etc.).

### Logging

Use the logger from `common/logger.ts` (chalk-based, handles verbose mode).

## Important Notes

- All paths in `common/config.ts` are resolved relative to either `cliRoot` (the CLI installation) or `projectRoot` (where the user runs commands).
- Session files in `.postkit/` track migration state and enable resume capability.
- The `vendor/` directory contains platform-specific binaries that are bundled with the CLI - no separate installation required.
