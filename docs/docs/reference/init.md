---
sidebar_position: 1
---

# Init Command

`postkit init` scaffolds a new PostKit project. It can scaffold everything at once, or be scoped to a single module.

## Usage

```bash
postkit init [module]
```

## Arguments

| Argument | Description |
|----------|--------------|
| `module` | Optional. One of `db`, `auth`, `stack`. Omit to scaffold the entire project. |

## Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |
| `--dry-run` | Show what would be done without making changes |

## Examples

```bash
# Full project scaffold (db + auth + stack)
postkit init

# Scaffold only the db module
postkit init db

# Scaffold only the auth module
postkit init auth

# Scaffold only the stack module
postkit init stack

# Skip confirmation prompts
postkit init -f
```

## What Each Variant Creates

### `postkit init` (full)

- `postkit.config.json` — committed project configuration
- `postkit.secrets.json` + `postkit.secrets.example.json` — gitignored secrets file and a template for teammates
- `.postkit/db/` — `session/`, `migrations/`, `committed.json`
- `db/infra/001_roles.sql`, `db/infra/002_schemas.sql` — PostgREST roles and the `public`/`auth`/`storage` schemas
- `.postkit/db/migrations/00000000000001_create_storage_migrations_table.sql` — a bootstrap migration for a self-hosted storage service (e.g. Supabase storage-api). Delete it (and its entry in `committed.json`) if you don't run one. It never blocks `db start` on a brand-new project — `db deploy`/`db status` still treat it as a normal migration to deploy
- `.postkit/auth/` — `raw/`, `realm/`, `providers/`. Keycloak provider JARs are synced and the realm template is scaffolded
- `.postkit/stack/`
- `.gitignore` entries covering all of the above

### `postkit init db`

Scaffolds only `.postkit/db/` and `db/infra/*.sql`. Does **not** create the `storage.migrations` bootstrap migration — that file is full-init only.

### `postkit init auth`

Scaffolds only `.postkit/auth/` — syncs Keycloak provider JARs and scaffolds the realm template.

### `postkit init stack`

Scaffolds only `.postkit/stack/`.

## Scoped Runs Are Additive

A scoped `init <module>` run only adds that module's files — it never touches what other modules already scaffolded, so you can build up a project incrementally:

```bash
postkit init db      # project doesn't exist yet — prompts for a project name, creates config
postkit init auth    # adds auth files only; reuses the existing project name, no prompt
```

`postkit.config.json`/`postkit.secrets.json` are only ever created the first time any `init` variant runs (always with the full db+auth+stack shape). A scoped run never re-prompts for the project name or overwrites an existing config.

## Idempotency

Every `init` variant is safe to re-run. Existing files are left untouched, and entries in `.gitignore` and `committed.json` are never duplicated.

## Related

- [Configuration](/docs/getting-started/configuration)
- [Project Structure](/docs/reference/project-structure)
- [Quick Start](/docs/getting-started/quick-start)
