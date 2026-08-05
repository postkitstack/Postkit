---
sidebar_position: 1
---

# db start

Clone a remote database to local and initialize a migration session.

## Usage

```bash
postkit db start [--remote <name>]
```

## Options

| Option | Description |
|--------|-------------|
| `--remote <name>` | Use specific remote (otherwise uses default) |
| `-v, --verbose` | Enable verbose output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output as JSON |

## Examples

```bash
# Uses default remote
postkit db start

# Use specific remote
postkit db start --remote staging
```

## What It Does

1. Checks prerequisites (pgschema, dbmate, **and `psql`** installed)
2. Resolves target remote (default or specified)
3. Tests connection to remote database and detects its PostgreSQL major version
4. Checks for pending committed migrations
5. **If `localDbUrl` is empty**: Checks Docker availability and starts a `postgres:{version}-alpine` container on a free port (15432–15532), version-matched to the remote
6. **Applies `db/infra/` (roles, schemas, extensions) to the local database** — before anything is cloned
7. Clones the remote database's **structure only** (no row data) to local. When using an auto-container, cloning runs via `docker exec` inside the container; otherwise it runs on the host, which is why `psql` must be installed
8. Creates a session file (`.postkit/db/session.json`) to track state, including the `containerID` if a container was started

## Why Infra Is Applied Before Cloning

The remote's dump includes `CREATE POLICY ... TO <role>`, `GRANT ... TO <role>`, and `ALTER DEFAULT PRIVILEGES ... TO <role>` statements for every custom role referenced by your RLS policies and grants. Those statements fail with `role "<role>" does not exist` if replayed before the role exists — which is exactly the case on a brand-new local database or container. Applying `db/infra/` first means the roles your project already declares exist by the time the clone runs, so RLS policies and grants clone correctly.

**Keep `db/infra/` limited to roles, schemas, and extensions — never tables.** If a table were defined there, it would already exist locally by the time the clone tries to create that same table, causing the clone to fail. Tables belong in `db/schema/<name>/tables/` instead.

## Why the Clone Is Schema-Only

`db start` clones structure only — no row data. Copying full production data (customer records, emails, tokens, etc.) into every disposable local dev container on every `db start` is unnecessary and a privacy/compliance risk. For local test data, use `db/schema/<name>/seeds/`, applied separately via `db plan`/`db apply`.

`postkit db deploy`'s own dry-run clone is unaffected by this — it still clones full data, since it's specifically verifying real migrations against realistic data before they touch production.

## Auto Docker Container

When `db.localDbUrl` is not set in your secrets file, PostKit automatically:
- Pulls and starts `postgres:{remote-version}-alpine`
- Uses `docker exec` to run `pg_dump`/`psql` inside the container (version-matched tools)
- Stores the container ID in the session
- Stops and removes the container when you run `postkit db abort`

## Related

- [`plan`](/docs/modules/db/commands/plan) - Generate schema diff
- [`status`](/docs/modules/db/commands/status) - Show session state
- [`abort`](/docs/modules/db/commands/abort) - Cancel session
