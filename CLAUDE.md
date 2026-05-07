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
│       │   ├── commands/     # Command handlers (start, plan, apply, commit, deploy, remote, etc.)
│       │   ├── services/     # Core business logic (database, pgschema, dbmate)
│       │   ├── utils/        # DB-specific utilities (session, db-config, remotes)
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

1. **Session state**: Tracked in `.postkit/db/session.json`. Includes `remoteName` to track which remote was used, and optional `containerID` for auto Docker containers.
2. **Named remotes**: Users can configure multiple named remote databases via `db.remotes` in config:
   - At least one remote must be configured
   - One remote can be marked as `default: true`
   - Managed via `postkit db remote` commands
   - Metadata (name, default, addedAt) written to `postkit.config.json`; URL written to `postkit.secrets.json`
3. **Binary resolution**: Both `pgschema` and `dbmate` binaries are auto-resolved:
   - `pgschema`: Bundled in `vendor/pgschema/` for all platforms (darwin-{arm64,amd64}, linux-{arm64,amd64}, windows-{arm64,amd64})
   - `dbmate`: npm-installed via the `dbmate` package
4. **Auto Docker container** (`modules/db/services/container.ts`): When `localDbUrl` is empty, PostKit:
   - Checks Docker availability (`checkDockerAvailable()`)
   - Queries remote PG version via `getRemotePgMajorVersion()` (uses `SHOW server_version_num`)
   - Starts `postgres:{version}-alpine` on a free port in range 15432–15532
   - Runs `pg_dump`/`psql` inside the container via `docker exec` (`cloneDatabaseViaContainer()`)
   - Stores `containerID` in session; cleaned up on `db abort` or `db deploy` completion
5. **Migration steps execution**: The `deploy` command uses `runSteps()` to execute multi-step operations with resume capability - if a step fails, re-running resumes from where it left off.
6. **Schema directory structure** (`db/schema/`):
   - `infra/` - Pre-migration (roles, schemas, extensions) - excluded from pgschema
   - `extensions/`, `types/`, `enums/`, `tables/`, etc. - pgschema-managed
   - `seeds/` - Post-migration seed data - excluded from pgschema

### PostKit Directory Structure

All PostKit runtime files are stored in `.postkit/` (gitignored):

```
.postkit/
└── db/
    ├── session.json         # Current session state
    ├── committed.json       # Committed migrations tracking
    ├── plan.sql             # Generated migration plan
    ├── schema.sql           # Generated schema from files
    ├── session/             # Session migrations (temporary)
    └── migrations/          # Committed migrations (for deploy)
```

**Key paths** (from `modules/db/utils/db-config.ts`):
- `getPostkitDbDir()` - `.postkit/db/`
- `getSessionFilePath()` - `.postkit/db/session.json`
- `getCommittedFilePath()` - `.postkit/db/committed.json`
- `getPlanFilePath()` - `.postkit/db/plan.sql`
- `getGeneratedSchemaPath()` - `.postkit/db/schema.sql`
- `getSessionMigrationsPath()` - `.postkit/db/session/`
- `getCommittedMigrationsPath()` - `.postkit/db/migrations/`

**Key functions** (from `modules/db/services/`):
- `generateSchemaSQLAndFingerprint()` - Reads all schema files once and returns both the output path (`.postkit/db/schema.sql`) and a SHA-256 fingerprint of the source files

### Configuration System

Config is loaded by `loadPostkitConfig()` from `common/config.ts`, which deep-merges two files:

| File | Committed | Purpose |
|------|-----------|---------|
| `postkit.config.json` | Yes | Non-sensitive settings (schema paths, remote metadata, flags) |
| `postkit.secrets.json` | No (gitignored) | Credentials (database URLs, passwords) |

**`postkit.config.json` (committed):**
```json
{
  "db": {
    "localDbUrl": "",
    "schemaPath": "db/schema",
    "schema": "public",
    "remotes": {
      "dev": { "default": true, "addedAt": "2024-12-31T10:00:00.000Z" },
      "staging": {}
    }
  }
}
```

**`postkit.secrets.json` (gitignored):**
```json
{
  "db": {
    "localDbUrl": "postgres://...",
    "remotes": {
      "dev": { "url": "postgres://..." },
      "staging": { "url": "postgres://..." }
    }
  }
}
```

**`localDbUrl`**: Leave empty to have PostKit automatically start a `postgres:{version}-alpine` Docker container. The version is queried from the remote DB via `SHOW server_version_num`. The container is started on `db start` and stopped on `db abort`.

**Auto-migration:** When loading config, if `remotes` is missing but `remoteDbUrl` exists, it's auto-migrated to create a `default` remote.

Key config paths:
- `POSTKIT_CONFIG_FILE` = "postkit.config.json"
- `POSTKIT_SECRETS_FILE` = "postkit.secrets.json"
- `POSTKIT_DIR` = ".postkit" (session state, staged files)
- `vendor/` = Bundled binaries (resolved relative to CLI root, not project root)

### Remote Management

Remotes are managed via utilities in `modules/db/utils/remotes.ts`:
- `getRemotes()` - Get all configured remotes (throws if none)
- `getRemote(name)` - Get specific remote
- `getDefaultRemote()` - Get default remote name
- `addRemote(name, url, setAsDefault?)` - Add new remote
- `removeRemote(name, force?)` - Remove remote
- `setDefaultRemote(name)` - Set default remote
- `resolveRemote(name?)` - Resolve {name, url} for a remote (uses default if no name)
- `resolveRemoteUrl(name?)` - Just get the URL

### Build System

- **tsup** is used for bundling (ES modules only, Node 18+ target)
- **tsx** for development mode (direct TS execution without building)
- Output goes to `dist/` with a shebang banner for CLI execution

## Database Module Commands Reference

| Command | Purpose |
|---------|---------|
| `postkit db start [--remote <name>]` | Clone remote DB to local, start session |
| `postkit db plan` | Generate schema diff with pgschema |
| `postkit db apply` | Apply migration to local DB (creates dbmate migration) |
| `postkit db commit` | Commit session migrations for deployment |
| `postkit db deploy [--remote <name>]` | Deploy committed migrations (with dry-run verification) |
| `postkit db status` | Show session state |
| `postkit db abort` | Cancel session, cleanup local resources |
| `postkit db migration [<name>]` | Create a manual SQL migration |
| `postkit db remote list` | List all configured remotes |
| `postkit db remote add <name> <url>` | Add a new remote |
| `postkit db remote remove <name>` | Remove a remote |
| `postkit db remote use <name>` | Set default remote |
| `postkit db infra [--apply]` | Manage infra SQL (roles, schemas, extensions) |
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

`CommandOptions` includes the following global flags available to all commands:
- `verbose` - Enable verbose/debug output (`-v, --verbose`)
- `dryRun` - Show what would be done without making changes (`--dry-run`)
- `json` - Output results as machine-readable JSON, useful for scripting/CI (`--json`)

### Shell Command Execution

Use the `shell()` utility from `common/shell.ts` for running external commands (pg_dump, psql, etc.).

### Logging

Use the logger from `common/logger.ts` (chalk-based, handles verbose mode).

### Remote Resolution

When working with remote databases:
```typescript
import {resolveRemote, maskRemoteUrl} from "../utils/remotes";

// Resolve remote (uses default if no name specified)
const {name, url} = resolveRemote(options.remote);
logger.info(`Using remote: ${name}`);

// Mask URL for logging
logger.debug(`Remote URL: ${maskRemoteUrl(url)}`, options.verbose);
```

## Important Notes

- All paths in `common/config.ts` are resolved relative to either `cliRoot` (the CLI installation) or `projectRoot` (where the user runs commands).
- Session files in `.postkit/db/` track migration state and enable resume capability.
- The `vendor/` directory contains platform-specific binaries that are bundled with the CLI - no separate installation required.
- The `.gitignore` should include `.postkit/` to ignore all runtime files.
- All migration-related files are in `.postkit/db/` - the only user-maintained DB files should be in `db/schema/`.

## Claude Code Skills & Agents

Skills are invoked via `/<skill-name>` in Claude Code. Agents are sub-processes spawned by skills.

### Project Documentation (`cli/docs/`)

| Doc | Content |
|-----|---------|
| `cli/docs/architecture.md` | System architecture, module system, dependency direction |
| `cli/docs/db.md` | Database module workflow and commands |
| `cli/docs/auth.md` | Auth module workflow and commands |
| `cli/docs/e2e-testing.md` | E2E testing guide and infrastructure |

### Skills Registry

| Skill | Invocation | Purpose | Sub-Agents |
|-------|-----------|---------|------------|
| create-pr | `/create-pr` | Generate PR description to `temp/pr-description.md` | — |
| write-test-e2e | `/write-test-e2e` | Write E2E tests using testcontainers | e2e-test-agent |
| write-test-unit | `/write-test-unit` | Write unit tests with Vitest mocks | unit-test-agent |
| bugfix | `/bugfix` | Diagnose and fix bugs (asks for info, 4 stages) | bugfixer, tester, reviewer, validator |
| create-feature | `/create-feature` | Implement features (asks for info, 4 stages + tests) | feature-planner, senior-engineer, reviewer, validator, architect |
| architecture | `/architecture` | Review architecture, generate ADRs | architect |
| update-docs | `/update-docs` | Update documentation for code changes | docs-agent |

### Agents Registry

| Agent | File | Specialty | Used By |
|-------|------|-----------|---------|
| e2e-test-agent | `.claude/agents/e2e-test-agent.md` | E2E test implementation (testcontainers) | write-test-e2e |
| unit-test-agent | `.claude/agents/unit-test-agent.md` | Unit test implementation (Vitest mocks) | write-test-unit |
| bugfixer | `.claude/agents/bugfixer.md` | Bug diagnosis and minimal fix | bugfix |
| tester | `.claude/agents/tester.md` | Regression test creation | bugfix |
| reviewer | `.claude/agents/reviewer.md` | Code review (reuse, lint, best practices) | bugfix, create-feature |
| validator | `.claude/agents/validator.md` | Build/test/quality validation | bugfix, create-feature |
| feature-planner | `.claude/agents/feature-planner.md` | Feature design and task breakdown | create-feature |
| senior-engineer | `.claude/agents/senior-engineer.md` | Feature implementation | create-feature |
| architect | `.claude/agents/architect.md` | Architecture analysis, ADR authoring | architecture |
| docs-agent | `.claude/agents/docs-agent.md` | Documentation writing and maintenance | update-docs |
