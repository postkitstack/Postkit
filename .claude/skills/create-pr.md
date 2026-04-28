---
name: create-pr
description: Generate a PR description and save to temp/pr-description.md.
---

# Create PR Skill

Generate a standardized PR description for the PostKit project and save it to `temp/pr-description.md`.

## Project Context

Read `CLAUDE.md` at the project root for project conventions.
Use the PR template at `.github/pull_request_template.md`.

## Workflow

### Step 1: Analyze Changes
Gather branch information:
```bash
git log origin/main...HEAD --oneline
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```
Categorize changes into: features, fixes, refactors, tests, docs, chore.

### Step 2: Generate PR Description
Using the PR template structure, generate:

**Title** — under 70 characters with conventional commit prefix:
- `feat: <description>` for new features
- `fix: <description>` for bug fixes
- `refactor: <description>` for code refactoring
- `test: <description>` for test changes
- `docs: <description>` for documentation changes
- `chore: <description>` for build/tooling changes

**Body** — using the template sections:
- Summary (1-3 bullet points)
- Changes (specific list)
- Type of Change (check one)
- Test Plan (checklist)

### Step 3: Save to File
Create `temp/` directory if needed and save to `temp/pr-description.md`.
Use the exact format from `.github/pull_request_template.md` — read that file and follow its structure.

### Step 4: Show to User
Display the generated PR description and ask for confirmation or edits before saving.
