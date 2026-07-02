---
sidebar_position: 3
---

# db apply

Apply the planned schema changes to the local cloned database.

## Usage

```bash
postkit db apply [-f]
```

## Options

| Option | Description |
|--------|-------------|
| `-f` | Skip confirmation prompts |
| `-v, --verbose` | Enable verbose output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output as JSON |

## What It Does

1. Validates per-schema fingerprints (ensures schema files haven't changed since plan)
2. Displays the planned changes
3. Tests local database connection
4. Applies infrastructure SQL from `db/infra/`
5. For each schema with changes: wraps plan SQL with `SET search_path TO "<name>"` and combines into one migration file (staged in `.postkit/db/session/`)
6. Runs `dbmate migrate` on the local database
7. Applies seed data from `db/schema/<name>/seeds/` for each schema in config order

**Resume support:** If seeds fail, re-running `postkit db apply` resumes from where it left off.

## Requirements

- An active session must exist
- A plan must exist (run `db plan` first)

## Related

- [`plan`](/docs/modules/db/commands/plan) - Generate schema diff
- [`commit`](/docs/modules/db/commands/commit) - Commit for deployment
