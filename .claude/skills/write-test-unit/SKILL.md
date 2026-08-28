---
name: write-test-unit
description: Write unit tests for PostKit CLI using Vitest with proper mocking patterns.
metadata:
  internal: true
---

# Write Unit Tests Skill

Write unit tests for the PostKit CLI project.

## Project Context

Read `CLAUDE.md` at the project root for project structure.

## Workflow

### Step 1: Identify What to Test
- Read the source file that needs tests
- Identify exported functions and their dependencies
- Check for existing test coverage in `cli/test/`

### Step 2: Write the Test
Follow the unit test patterns:

```typescript
import {describe, it, expect, vi, beforeEach} from "vitest";

// Mock dependencies BEFORE importing the module under test
vi.mock("../../src/common/shell", () => ({
  runCommand: vi.fn(),
}));

vi.mock("../../src/common/config", () => ({
  loadPostkitConfig: vi.fn(),
}));

import {runCommand} from "../../src/common/shell";
import {loadPostkitConfig} from "../../src/common/config";
```

**Conventions:**
- Mirror source file path: `cli/test/<path>/<file>.test.ts`
- Use mock helpers from `cli/test/helpers/`: mock-config, mock-shell, mock-fs, mock-pg
- Call `vi.clearAllMocks()` in `beforeEach`
- Group with nested `describe()` blocks by function
- Test both success and error paths

### Step 3: Run and Verify
```bash
cd cli && npm run test
```
If tests fail, fix and re-run.

## Reference Files
- `cli/test/helpers/` - Mock utility helpers
- `cli/vitest.config.ts` - Test configuration
- Existing tests in `cli/test/common/` - Pattern examples
