---
name: update-docs
description: Update project documentation when code changes occur.
metadata:
  internal: true
---

# Update Docs Skill

Update project documentation to reflect code changes in the PostKit CLI project.

## Project Context

Read `CLAUDE.md` at the project root for project structure.
Read existing docs for style reference.

## Documentation Files

### Developer Docs (`cli/docs/`)
- `cli/docs/architecture.md` - System architecture and design decisions
- `cli/docs/db.md` - Database module documentation
- `cli/docs/auth.md` - Auth module documentation
- `cli/docs/e2e-testing.md` - E2E testing guide

### User Docs (Docusaurus)
- `docs/docs/getting-started/` - Installation, configuration
- `docs/docs/modules/db/` - DB module user docs
- `docs/docs/modules/auth/` - Auth module user docs
- `docs/docs/reference/` - CLI reference

## Workflow

### Step 1: Detect Changes
Identify what changed in the codebase:
- New or modified commands
- Changed command options
- Config structure changes
- New modules or services
- Workflow changes

### Step 2: Find Affected Docs
Map code changes to documentation:
- Command changes → `cli/docs/db.md` or `cli/docs/auth.md`
- Config changes → CLAUDE.md and module docs
- New modules → CLAUDE.md and new doc page
- Test changes → `cli/docs/e2e-testing.md`
- User-facing changes → Docusaurus `docs/docs/`

### Step 3: Update Documentation
- Follow the existing style in each doc file
- Update command reference tables
- Add new code examples
- Verify cross-references between docs
- Keep CLAUDE.md concise

### Step 4: Verify
- Code examples are accurate and runnable
- Command names and flags match source code
- Config examples match current schema
- No stale or outdated information remains
