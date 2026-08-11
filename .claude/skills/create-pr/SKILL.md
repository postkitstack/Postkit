---
name: create-pr
description: Generate a PR description for the current branch and save it to temp/pr-description.md. Analyzes commits against the base branch and fills in the project PR template exactly.
argument-hint: "[base-branch]"
allowed-tools: Bash, Read, Write
metadata:
  internal: true
---

# Create PR Skill

Generate a standardized PR description following the project template and save it to `temp/pr-description.md`. Does NOT push or create the PR on GitHub — description only.

## Arguments

Optional: base branch to compare against (e.g. `/create-pr development` or `/create-pr main`).
Default to `main` if no argument is provided.

## Workflow

### Step 1: Read the PR Template

**Always read the template file first** before writing anything:

```bash
cat .github/pull_request_template.md
```

The output must use the **exact section headings and checkbox format** from that file. Do not add, remove, or reorder sections.

### Step 2: Analyze Changes

Get the current branch and compare against the remote base:

```bash
git rev-parse --abbrev-ref HEAD
git fetch origin <base>
git log origin/<base>...HEAD --oneline
git diff origin/<base>...HEAD --stat
```

Always use `origin/<base>` so the comparison is against the remote state.

### Step 3: Generate PR Title and Body

**Title** — under 70 characters, conventional commit prefix:
- `feat:` new feature
- `fix:` bug fix
- `refactor:` no functional change
- `test:` test changes
- `docs:` documentation only
- `chore:` build/tooling/CI

**Body** — fill in each template section in exact order:
- `## Summary` — 1–3 bullet points of what the PR does
- `## Changes` — bullet list of specific files/components changed
- `## Type of Change` — mark exactly one checkbox `[x]`
- `## Test Plan` — check completed items; fill in the "Manually tested:" line
- `## Breaking Changes` — `[x] No breaking changes` if none; otherwise list them

### Step 4: Save to `temp/pr-description.md`

```bash
mkdir -p temp
```

Write the file with this exact structure:
```
# <title>

**Branch:** `<current-branch>` → `<base-branch>`

<body following template sections exactly>
```

### Step 5: Show the Result

Display the full content of `temp/pr-description.md` to the user and confirm it is saved.
