---
name: create-feature
description: "Implement new features end-to-end: gather info, plan, implement, test, validate, review."
metadata:
  internal: true
---

# Create Feature Skill

Implement new features for the PostKit CLI project using a multi-stage pipeline.

## Project Context

- `CLAUDE.md` — Project structure and "Adding a New Module" section
- `cli/docs/architecture.md` — System architecture, module structure, dependency direction
- `cli/docs/db.md` — Database module as reference implementation
- `cli/docs/auth.md` — Auth module as reference implementation

## Pre-Flight: Gather Missing Info

Before starting, check if the user provided enough context. If any of these are missing, **ask the user** before proceeding:

- What is the feature? (description or user story)
- Which module does it belong to? (`db`, `auth`, or new module?)
- What commands should be added or modified?
- Any specific CLI flags or options expected?
- Any config changes needed?
- Target branch? (default: `development`)

**Do not start work until you have enough information to plan the feature.**

## Workflow

### Stage 1: Plan (feature-planner agent)
1. Understand the feature requirements
2. Determine if it fits an existing module or needs a new one
3. Map out files to create/modify:
   - `cli/src/modules/<name>/index.ts` - Module registration
   - `cli/src/modules/<name>/commands/` - Command handlers
   - `cli/src/modules/<name>/services/` - Business logic
   - `cli/src/modules/<name>/utils/` - Utilities
   - `cli/src/modules/<name>/types/` - TypeScript types
   - `cli/src/index.ts` - Module registration call
4. Identify existing patterns and utilities to reuse
5. Plan test coverage (unit + E2E)
6. Produce an implementation checklist

### Stage 2: Implement (senior-engineer agent)
1. Create module directory structure
2. Implement types first, then services, then commands, then registration
3. Follow project patterns:
   - `register<Name>Module(program: Command)` for registration
   - `CommandOptions` for command handler signatures
   - `loadPostkitConfig()` for config, `logger.*` for output, `shell()` for commands
4. Handle global flags: `verbose`, `dryRun`, `json`, `force`
5. Register in `cli/src/index.ts`

### Stage 2b: Write Tests (unit-test-agent + e2e-test-agent)
**This step is mandatory — every feature must include tests.**

Unit tests:
1. Mirror source file paths: `cli/test/<path>/<file>.test.ts`
2. Use `vi.mock()` for all external dependencies
3. Use helpers from `cli/test/helpers/`: mock-config, mock-shell, mock-fs, mock-pg
4. Test success paths, error paths, and edge cases
5. Run: `cd cli && npm run test`

E2E tests (if feature adds/modifies user-facing commands):
1. Write workflow test in `cli/test/e2e/workflows/`
2. Use helpers from `cli/test/e2e/helpers/`: cli-runner, test-project, test-database, workflow
3. Test full command lifecycle with real PostgreSQL (testcontainers)
4. Run: `cd cli && npm run test:e2e:file -- <test-file>`

### Stage 3: Validate (validator agent)
1. Build: `cd cli && npm run build`
2. Type check: `cd cli && npx tsc --noEmit`
3. Run existing unit tests: `cd cli && npm run test`
4. Run relevant E2E tests
5. Verify file structure and imports

### Stage 4: Review (reviewer + architect agents)

**Code review** (reviewer agent):
- Check for code reuse — reuse existing utilities, don't duplicate logic
- Check TypeScript quality (no `any`, proper types, no unused imports)
- Check error handling patterns (logger.error for user-facing, throw for unexpected)
- Check backward compatibility
- Check security (no SQL injection, no credential exposure)

**Architecture review** (architect agent):
1. Does the feature fit the module system?
2. API design consistency with existing commands
3. Error handling completeness
4. Edge case coverage
5. Documentation needs identified

## Output
- Implementation plan
- Source code for the feature
- Unit and E2E tests
- Validation results
- Architecture review notes

**Note:** Use `/create-pr` separately when ready to create a pull request.
