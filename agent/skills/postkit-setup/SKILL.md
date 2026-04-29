---
name: postkit-setup
description: Initialize a PostKit project and configure database remotes, local DB URL, and schema paths. Use this skill whenever the user mentions setting up PostKit, initializing a project, configuring remotes, editing postkit.config.json, adding a database remote, changing local DB URL, or first-time project setup — even if they don't explicitly name PostKit.
argument-hint: [action]
paths: postkit.config.json
allowed-tools: Bash(postkit *)
---

# PostKit Project Setup

Initialize and configure a PostKit project for database migration management.

## Initialize a New Project

```bash
postkit init
```

This creates:
- `postkit.config.json` — Project configuration
- `db/schema/` — Schema directory structure
- `.postkit/` — Runtime directory (gitignored)
- `.gitignore` entries for `.postkit/`

Add `-f` to skip confirmation prompts:

```bash
postkit init -f
```

## Configuration Structure

PostKit loads config from `postkit.config.json` in the project root. The database config:

```json
{
  "db": {
    "localDbUrl": "postgres://localhost:5432/mydb",
    "schemaPath": "schema",
    "schema": "public",
    "remotes": {
      "dev": {
        "url": "postgres://user:pass@dev-host:5432/mydb",
        "default": true,
        "addedAt": "2024-12-31T10:00:00.000Z"
      },
      "staging": {
        "url": "postgres://user:pass@staging-host:5432/mydb"
      }
    }
  }
}
```

Key fields:
- `localDbUrl` — PostgreSQL URL for the local clone (used during sessions)
- `schemaPath` — Path to schema files relative to `db/` (default: `"schema"`)
- `schema` — PostgreSQL schema name (default: `"public"`)
- `remotes` — Named remote databases for cloning and deploying

## Managing Remotes

### List configured remotes

```bash
postkit db remote list
```

### Add a remote

```bash
postkit db remote add dev "postgres://user:pass@dev-host:5432/mydb"
```

Add `--default` to set it as the default remote:

```bash
postkit db remote add dev "postgres://..." --default
```

### Remove a remote

```bash
postkit db remote remove dev
```

### Set default remote

```bash
postkit db remote use staging
```

## Schema Directory

After init, the schema directory is at `db/schema/`. See the `postkit-schema` skill for the full directory structure and how to work with schema files.

## Common Setup Issues

### No remotes configured

At least one remote must be configured before running `postkit db start`. Add one:

```bash
postkit db remote add dev "postgres://..." --default
```

### Missing localDbUrl

The `localDbUrl` must point to a PostgreSQL database accessible from the local machine. This is where the remote DB is cloned during sessions.

### Not initialized

If `postkit.config.json` is missing, run `postkit init` first.
