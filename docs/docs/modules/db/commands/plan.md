---
sidebar_position: 2
---

# db plan

Generate a schema diff showing what changes will be applied.

## Usage

```bash
postkit db plan
```

## Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose output |
| `--json` | Output as JSON |

## What It Does

1. Combines all schema files from `db/schema/` into a single SQL file (excluding `infra/`, `grants/`, `seeds/`)
2. Runs `pgschema plan` to compare against local database
3. Saves a schema fingerprint (SHA-256 hash of source files) for validation during apply
4. Displays the migration plan and saves to `.postkit/db/plan.sql`

## Requirements

- An active session must exist (run `db start` first)

## Related

- [`start`](/docs/modules/db/commands/start) - Start a session
- [`apply`](/docs/modules/db/commands/apply) - Apply the planned changes
