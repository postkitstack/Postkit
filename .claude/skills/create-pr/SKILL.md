---
name: create-pr
description: Generate a PR description and save to temp/pr-description.md.
---

# Create PR Skill

Generate a standardized PR description for the PostKit project and save it to `temp/pr-description.md`.

## Arguments

Optional: base branch to compare against (e.g. `/create-pr dev` or `/create-pr main`).
Default to `main` if no argument is provided.

## Project Context

Read `CLAUDE.md` at the project root for project conventions.
Use the PR template at `.github/pull_request_template.md`.

## Workflow

### Step 1: Analyze Changes

Determine the base branch from the argument (default: `main`). Then gather branch information:
```bash
git log origin/<base>...HEAD --oneline
git diff origin/<base>...HEAD --stat
git diff origin/<base>...HEAD
```
Categorize changes into: features, fixes, refactors, tests, docs, chore.

### Step 2: Generate PR Description

**Title** — under 70 characters with conventional commit prefix:
- `feat: <description>` for new features
- `fix: <description>` for bug fixes
- `refactor: <description>` for code refactoring
- `test: <description>` for test changes
- `docs: <description>` for documentation changes
- `chore: <description>` for build/tooling changes

**Body** — follow the exact section order from `.github/pull_request_template.md`:
1. **Summary** — 1-3 bullet points describing what this PR does
2. **Changes** — specific list of changes made
3. **Type of Change** — check one box (`[x]`) matching the primary change type
4. **Test Plan** — check completed items; fill in "Manually tested" description
5. **Breaking Changes** — check "No breaking changes" if none; otherwise describe them

### Step 3: Save to File

Create `temp/` directory if needed and save to `temp/pr-description.md`.

The file must follow this exact structure:
```
# <title>

**Branch:** `<current-branch>` → `<base-branch>`

## Summary
...

## Changes
...

## Type of Change
...

## Test Plan
...

## Breaking Changes
...
```

Get the current branch name with:
```bash
git rev-parse --abbrev-ref HEAD
```

### Step 4: Show to User

Display the full generated PR description from the saved file and invite the user to request edits.
