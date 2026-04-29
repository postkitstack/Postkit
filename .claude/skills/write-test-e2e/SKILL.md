---
name: write-test-e2e
description: Write end-to-end tests for PostKit CLI using testcontainers and black-box testing.
---

# Write E2E Tests Skill

Write E2E tests for the PostKit CLI project.

## Project Context

Read `CLAUDE.md` at the project root for project structure.
Read `cli/docs/e2e-testing.md` for the complete E2E testing guide.

## Workflow

### Step 1: Understand What to Test
- Read the source code for the feature/command being tested
- Identify the user-facing workflow to verify
- Check for existing E2E tests that cover similar scenarios

### Step 2: Write the Test
Follow the E2E test patterns:

```typescript
import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "./helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "./helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "./helpers/test-database";
import {startSession, runPlan, runApply, runCommit} from "./helpers/workflow";
```

**Conventions:**
- File location: `cli/test/e2e/workflows/` for workflows, `cli/test/e2e/error-handling/` for errors
- Use `--force` flag on state-modifying commands
- Proper `beforeAll`/`afterAll` cleanup for Docker containers and temp dirs
- Use `installFixtureSchema()` for realistic schemas
- Verify with `queryDatabase()` for direct SQL checks

### Step 3: Run and Verify
```bash
cd cli && npm run test:e2e:file -- <test-file-path>
```
If the test fails, fix it and re-run.

## Reference Files
- `cli/docs/e2e-testing.md` - Complete testing guide
- `cli/test/e2e/helpers/` - All helper modules
- Existing tests in `cli/test/e2e/workflows/` - Pattern examples
