---
name: postkit-migrate
description: Run PostKit database migrations — the session-based workflow of start, plan, apply, commit, and deploy. Use this skill whenever the user mentions migrating, deploying schema changes, running migrations, updating the database, schema diff, pushing to remote DB, cloning a database, or applying a migration — even if they don't explicitly say "migration" or "postkit".
argument-hint: [step]
paths: .postkit/db/**
allowed-tools: Bash(postkit *)
---

# PostKit Database Migration Workflow

Guide Claude through PostKit's session-based migration workflow. The user may want to run the full flow or resume from a specific step.

## Understanding the Workflow

PostKit uses a **session-based migration model**:

1. **Start** — Clone the remote DB to local, begin a session
2. **Plan** — Generate a schema diff per schema (what changed vs. remote baseline)
3. **Apply** — Apply the combined migration to the local cloned DB
4. **Commit** — Merge session migrations into a committed migration
5. **Deploy** — Deploy committed migrations to the remote DB

Sessions are tracked in `.postkit/db/session.json`. If a step fails, re-running resumes from where it left off.

## Running the Workflow

Check current status first to understand where we are:

```bash
postkit db status --json
```

Use the `--json` flag when you need to parse output programmatically. The JSON output includes session state, pending changes, and remote info.

### Step 1: Start a Session

```bash
postkit db start
```

This clones the remote database to local and starts a new session. Optionally specify a remote:

```bash
postkit db start --remote staging
```

### Step 2: Plan the Migration

After making schema file changes in `db/schema/<name>/`, generate the diff:

```bash
postkit db plan
```

PostKit runs pgschema per schema in config order, with intermediate applies between schemas to resolve cross-schema references. Each schema produces a `plan_<name>.sql` file in `.postkit/db/`. Review the plan output before proceeding.

### Step 3: Apply to Local

```bash
postkit db apply
```

Validates fingerprints, wraps all per-schema plan files into a single dbmate migration file, and applies it to the local cloned database. Creates the migration file in `.postkit/db/session/`.

### Step 4: Commit the Session

```bash
postkit db commit
```

Merges all session migrations into a single committed migration in `.postkit/db/migrations/`. Optionally provide a message:

```bash
postkit db commit -m "Add users table and email column"
```

### Step 5: Deploy to Remote

```bash
postkit db deploy
```

Deploys committed migrations to the remote database. Includes a dry-run verification step. Specify a remote if needed:

```bash
postkit db deploy --remote staging
```

## Resuming a Failed Step

If any step fails, fix the issue and re-run the same command — PostKit resumes from where it left off. Check status first:

```bash
postkit db status
```

## Aborting a Session

If you need to cancel and start over:

```bash
postkit db abort
```

This cancels the session and cleans up local resources.

## Common Patterns

### Quick schema change cycle

```bash
# Edit schema files in db/schema/<name>/tables/ etc.
postkit db plan        # See what changed across all schemas
postkit db apply       # Apply locally
postkit db commit      # Commit the change
```

### Deploy without a new session

If migrations are already committed:

```bash
postkit db deploy --remote production
```

### Manual migration (outside schema files)

```bash
postkit db migration add_index_to_users
```

This creates an empty migration file you can write raw SQL into.
