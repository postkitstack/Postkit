---
sidebar_position: 9
---

# db remote

Manage named remote databases.

## Usage

```bash
postkit db remote <subcommand> [options]
```

## Subcommands

### list

List all configured remotes.

```bash
postkit db remote list
postkit db remote list --json
```

### add

Add a new remote.

```bash
postkit db remote add <name> <url> [--default]
```

| Option | Description |
|--------|-------------|
| `--default` | Set as default remote |

**Validations:**
- Name must be alphanumeric (letters, numbers, hyphens, underscores)
- URL must be a valid PostgreSQL connection string
- URL cannot match `localDbUrl` (your local database)
- URL cannot duplicate an existing remote

**Example:**
```bash
postkit db remote add staging "postgres://user:pass@host:5432/db"
postkit db remote add production "postgres://user:pass@host:5432/db" --default
```

### remove

Remove a remote.

```bash
postkit db remote remove <name> [--force]
```

| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation |

### use

Set a remote as the default.

```bash
postkit db remote use <name>
```

## Related

- [`start`](/docs/modules/db/commands/start) - Start session with remote
- [`deploy`](/docs/modules/db/commands/deploy) - Deploy to remote
