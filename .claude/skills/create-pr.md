---
name: create-pr
description: Create a standardized GitHub pull request with build verification and change analysis.
---

# Create PR Skill

Create a standardized GitHub PR for the PostKit project.

## Project Context

Read `CLAUDE.md` at the project root for project conventions.
Use the PR template at `.github/pull_request_template.md`.

## Workflow

### Step 1: Pre-PR Verification
Run build and unit tests to ensure the branch is in a good state:
```bash
cd cli && npm run build
cd cli && npm run test
```
If either fails, report the failure and stop.

### Step 2: Analyze Changes
Gather branch information:
```bash
git log origin/main...HEAD --oneline
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```
Categorize changes into: features, fixes, refactors, tests, docs, chore.

### Step 3: Generate PR
Using the `pr-agent` sub-agent approach:
- Generate a title under 70 characters with conventional commit prefix
- Populate the PR template sections
- Create the PR targeting `development` (or `main` for hotfixes):
```bash
gh pr create --base development --title "<title>" --body "<body>"
```

### Step 4: Post-Creation
- Verify the PR was created successfully
- Report the PR URL to the user

## PR Title Format
- `feat: <description>` for new features
- `fix: <description>` for bug fixes
- `refactor: <description>` for code refactoring
- `test: <description>` for test changes
- `docs: <description>` for documentation changes
- `chore: <description>` for build/tooling changes
