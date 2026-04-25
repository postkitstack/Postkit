---
name: postkit-migrate
description: Run PostKit database migrations — the session-based workflow of start, plan, apply, commit, and deploy. Use when the user mentions migrating, deploying schema changes, running migrations, or updating the database.
argument-hint: [step]
allowed-tools: Bash(postkit *)
---

# PostKit Database Migration Workflow

Guide Claude through PostKit's session-based migration workflow. The user may want to run the full flow or resume from a specific step.

## Understanding the Workflow

PostKit uses a **session-based migration model**:

1. **Start** — Clone the remote DB to local, begin a session
2. **Plan** — Generate a schema diff (what changed vs. remote baseline)
3. **Apply** — Apply the migration to the local cloned DB
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

After making schema file changes in `db/schema/`, generate the diff:

```bash
postkit db plan
```

This reads all schema files, generates the SQL diff, and saves it to `.postkit/db/plan.sql`. Review the plan output before proceeding.

### Step 3: Apply to Local

```bash
postkit db apply
```

Applies the planned migration to the local cloned database. This creates a dbmate migration file in `.postkit/db/session/`.

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
# Edit schema files in db/schema/tables/ etc.
postkit db plan        # See what changed
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
