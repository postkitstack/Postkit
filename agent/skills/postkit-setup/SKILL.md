---
name: postkit-setup
description: Initialize a PostKit project and configure database remotes, local DB URL, schema paths, and multi-schema support. Use this skill whenever the user mentions setting up PostKit, initializing a project, configuring remotes, editing postkit.config.json or postkit.secrets.json, adding a database remote, changing local DB URL, or first-time project setup — even if they don't explicitly name PostKit.
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
- `postkit.config.json` — Committed project configuration (schema paths, flags)
- `postkit.secrets.json` — Gitignored secrets (DB URLs, remote credentials)
- `db/schema/public/` — Default schema directory structure
- `db/infra/` — Infrastructure SQL directory (roles, schemas)
- `.postkit/db/migrations/` — includes a `storage.migrations` bootstrap migration for a self-hosted storage service (e.g. Supabase storage-api) — delete it (and its `committed.json` entry) if you don't run one
- `.postkit/` — Runtime directory (gitignored)
- `.gitignore` entries for secrets and ephemeral files

Add `-f` to skip confirmation prompts:

```bash
postkit init -f
```

### Scaffold a single module

`postkit init` with no argument scaffolds everything (db + auth + stack). To scaffold only one module — e.g. when adding a module to a project that was only ever partially initialized — pass its name:

```bash
postkit init db      # .postkit/db/, db/infra/*.sql
postkit init auth    # .postkit/auth/, Keycloak provider sync, realm template
postkit init stack   # .postkit/stack/
```

Scoped runs never re-prompt for or overwrite an existing `postkit.config.json`/`postkit.secrets.json` — they only create those files if missing, and reuse the existing project name otherwise. Each run is idempotent and only updates its own slice of `.gitignore`.

Note: the `storage.migrations` bootstrap migration is only scaffolded by the full `postkit init` — `postkit init db` does not create it.

## Configuration Files

PostKit splits config across two files:

### `postkit.config.json` (committed to git)

```json
{
  "db": {
    "schemaPath": "db/schema",
    "schemas": ["public"],
    "infraPath": "db/infra"
  }
}
```

Key fields:
- `schemaPath` — Root path for schema directories (default: `"db/schema"`)
- `schemas` — Array of PostgreSQL schema names; **array order = execution order** (default: `["public"]`)
- `infraPath` — Path to DB-level infra SQL (default: `"db/infra"`)

### `postkit.secrets.json` (gitignored — never commit)

```json
{
  "db": {
    "localDbUrl": "postgres://localhost:5432/mydb",
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
- `localDbUrl` — PostgreSQL URL for the local clone. Leave empty to have PostKit auto-start a Docker container version-matched to the remote.
- `remotes` — Named remote databases. At least one must be configured.

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

## Multi-Schema Setup

To add a second PostgreSQL schema to your project:

```bash
postkit db schema add app
```

This scaffolds `db/schema/app/`, adds `CREATE SCHEMA app;` to `db/infra/`, and appends `"app"` to the `schemas` array in `postkit.config.json`. Schemas are migrated in array order.

## Common Setup Issues

### No remotes configured

At least one remote must be configured before running `postkit db start`. Add one:

```bash
postkit db remote add dev "postgres://..." --default
```

### Auto Docker (empty localDbUrl)

Leave `localDbUrl` empty and PostKit will automatically start a `postgres:{version}-alpine` Docker container, version-matched to your remote DB. The container is started on `db start` and cleaned up on `db abort`.

### Not initialized

If `postkit.config.json` is missing, run `postkit init` first.
