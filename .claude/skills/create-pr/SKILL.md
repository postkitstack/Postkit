---
name: create-pr
description: Create a GitHub pull request for the current branch. Analyzes commits, generates a PR description following the project template, saves it to temp/pr-description.md, and creates the PR on GitHub using gh pr create.
argument-hint: "[base-branch]"
allowed-tools: Bash, Read, Write
---

# Create PR Skill

Create a GitHub pull request for the current branch by analyzing changes, generating a description that follows the project PR template exactly, and opening the PR via `gh pr create`.

## Arguments

Optional: base branch to compare against (e.g. `/create-pr development` or `/create-pr main`).
Default to `main` if no argument is provided.

## Workflow

### Step 1: Read the PR Template

**Always read the template file first** before generating any content:

```bash
cat .github/pull_request_template.md
```

The generated PR body must use the **exact section headings and checkbox format** from that file — do not invent new sections or change the order.

### Step 2: Analyze Changes

Get the current branch and fetch the base branch:

```bash
git rev-parse --abbrev-ref HEAD
git fetch origin <base>
git log origin/<base>...HEAD --oneline
git diff origin/<base>...HEAD --stat
```

Always use `origin/<base>` (not `<base>`) so the comparison is against the remote state.

Categorize changes into: features, fixes, refactors, tests, docs, chore.

### Step 3: Generate PR Title and Body

**Title** — under 70 characters, conventional commit prefix:
- `feat:` new feature
- `fix:` bug fix
- `refactor:` no functional change
- `test:` test changes
- `docs:` documentation only
- `chore:` build/tooling/CI

**Body** — reproduce the template sections in exact order, filling in each section:
- `## Summary` — 1–3 bullet points of what the PR does
- `## Changes` — bullet list of specific files/components changed and what changed
- `## Type of Change` — mark exactly one checkbox `[x]` matching the primary type
- `## Test Plan` — check completed items; fill in the "Manually tested:" line
- `## Breaking Changes` — check `[x] No breaking changes` if none; otherwise list them

### Step 4: Save to File

Create `temp/` if needed and save the full PR description:

```bash
mkdir -p temp
```

Write to `temp/pr-description.md` with this exact structure:
```
# <title>

**Branch:** `<current-branch>` → `<base-branch>`

<body following template sections>
```

### Step 5: Create the PR on GitHub

Push the branch if not already pushed, then create the PR:

```bash
git push -u origin <current-branch>

gh pr create \
  --base <base-branch> \
  --title "<title>" \
  --body "$(cat temp/pr-description.md)"
```

### Step 6: Show Result

Display the PR URL returned by `gh pr create` and show the full description from `temp/pr-description.md`.
