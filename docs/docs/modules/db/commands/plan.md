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

1. For each schema in `config.schemas` (in array order):
   a. Combines all schema files from `db/schema/<name>/` into `schema_<name>.sql` (excluding `seeds/`)
   b. Runs `pgschema plan --schema <name>` to compare against the local database — saves the plan to `.postkit/db/plan_<name>.sql`
   c. Applies the plan to the local DB immediately (intermediate apply — makes this schema's objects available for the next schema to reference at plan time)
2. Saves per-schema fingerprints (SHA-256 hash of source files) for validation during apply
3. Displays combined plan output across all schemas

**Note:** The intermediate apply in step 1c is critical for cross-schema references. If schema `app` references `public.fn()`, planning `app` requires `public.fn()` to already exist in the local DB.

## Requirements

- An active session must exist (run `db start` first)

## Related

- [`start`](/docs/modules/db/commands/start) - Start a session
- [`apply`](/docs/modules/db/commands/apply) - Apply the planned changes
