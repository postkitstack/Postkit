---
name: bugfix
description: "Diagnose and fix bugs with a 4-stage workflow: gather info, diagnose, fix, test, validate & review."
metadata:
  internal: true
---

# Bugfix Skill

Diagnose and fix bugs in the PostKit CLI project using a 5-stage pipeline.

## Project Context

- `CLAUDE.md` — Project structure and conventions
- `cli/docs/architecture.md` — System architecture and dependency direction
- `cli/docs/db.md` — Database module workflow and commands
- `cli/docs/auth.md` — Auth module workflow and commands

## Pre-Flight: Gather Missing Info

Before starting, check if the user provided enough context. If any of these are missing, **ask the user** before proceeding:

- What is the error message or unexpected behavior?
- Which command or workflow triggered the bug? (e.g., `postkit db import`, `postkit db deploy`)
- What are the reproduction steps?
- Any logs, stack traces, or screenshots?

**Do not start work until you have enough information to reproduce the bug.**

## Workflow

### Stage 1: Diagnose (bugfixer agent)
1. Understand the error message and reproduction steps
2. Read relevant source files to trace the error path
3. Check common PostKit failure areas:
   - Session state in `.postkit/db/session.json`
   - Remote URL resolution and config validation
   - Schema file parsing and pgschema binary execution
   - Shell command execution and error handling
   - Custom schema support (non-public PostgreSQL schemas)
4. Identify the root cause

### Stage 2: Fix (bugfixer agent)
1. Implement the minimal fix
2. Follow existing code patterns:
   - `CommandOptions` interface for command handlers
   - `loadPostkitConfig()` for configuration
   - `logger.*` for output, `shell()` for external commands
3. No refactoring or improvements beyond the fix
4. Preserve existing function signatures

### Stage 3: Test (tester agent)
1. Write unit tests that reproduce the bug scenario
2. Write E2E test if the bug affects user-facing workflow
3. Verify the test fails without the fix (confirms it catches the bug)
4. Run full unit test suite: `cd cli && npm run test`

### Stage 4: Validate & Review (validator + reviewer agents)
1. Build: `cd cli && npm run build`
2. Type check: `cd cli && npx tsc --noEmit`
3. All unit tests pass
4. Relevant E2E tests pass
5. **Code review** (reviewer agent):
   - Check for code reuse — reuse existing utilities from `common/`, `modules/*/utils/`, `modules/*/services/`
   - Check TypeScript quality (no `any`, proper types, no unused imports)
   - Check error handling patterns (logger.error for user-facing, throw for unexpected)
   - Check backward compatibility
   - Check security (no SQL injection, no credential exposure)

## Output
- Bug diagnosis summary
- Fix implementation
- New regression tests
- Validation results

**Note:** Use `/create-pr` separately when ready to create a pull request.
