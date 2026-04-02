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

1. Validates schema fingerprint (ensures schema files haven't changed since plan)
2. Displays the planned changes
3. Tests local database connection
4. Applies infrastructure SQL from `db/schema/infra/`
5. Wraps the plan SQL and creates a dbmate migration file (staged in `.postkit/db/session/`)
6. Runs `dbmate migrate` on the local database
7. Applies grant statements from `db/schema/grants/`
8. Applies seed data from `db/schema/seeds/`

**Resume support:** If grants or seeds fail, re-running `postkit db apply` resumes from where it left off.

## Requirements

- An active session must exist
- A plan must exist (run `db plan` first)

## Related

- [`plan`](/docs/modules/db/commands/plan) - Generate schema diff
- [`commit`](/docs/modules/db/commands/commit) - Commit for deployment
