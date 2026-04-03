# @appritech/postkit

> Developer toolkit for database migrations and backend automation

**Note:** This tool is still under development and not recommended for production use. APIs may change between versions.

[![npm version](https://badge.fury.io/js/@appritech/postkit.svg)](https://www.npmjs.com/package/@appritech/postkit)
[![License](https://img.shields.io/npm/l/@appritech/postkit.svg)](LICENSE)

PostKit CLI is a modular toolkit for backend development with the Appri stack. It provides safe database migrations, auth management, and more.

## 🚀 Quick Start

### Installation

```bash
npm install -g @appritech/postkit
```

### Requirements

| Requirement | Version | Download |
|-------------|---------|----------|
| **Node.js** | >= 18.0.0 | [nodejs.org](https://nodejs.org/) |
| **Docker** | Latest | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **PostgreSQL CLI** | `psql`, `pg_dump` | [postgresql.org/download](https://www.postgresql.org/download/) |

### Basic Usage

```bash
# Initialize a new project
postkit init

# Start a database migration session
postkit db start

# Preview schema changes
postkit db plan

# Apply changes to local database
postkit db apply

# Commit migrations for deployment
postkit db commit

# Deploy to remote database
postkit db deploy
```

## ✨ Features

- **Safe Database Migrations** - Clone remote databases locally, test changes safely, then deploy with confidence
- **Modular Architecture** - Each feature is a pluggable module (database, auth, and more coming soon)
- **Production Ready** - Dry-run verification ensures migrations work before touching production

## 📦 Modules

### Database Module (`db`)

Session-based database migration workflow for PostgreSQL.

| Command | Description |
|---------|-------------|
| `postkit db start` | Clone remote DB to local, start session |
| `postkit db plan` | Generate schema diff |
| `postkit db apply` | Apply migration to local DB |
| `postkit db commit` | Commit session migrations |
| `postkit db deploy` | Deploy to remote database |
| `postkit db status` | Show session state |
| `postkit db abort` | Cancel session |
| `postkit db remote` | Manage remote databases |
| `postkit db migration` | Create manual SQL migration |
| `postkit db infra` | Manage infrastructure SQL |
| `postkit db grants` | Manage grant statements |
| `postkit db seed` | Manage seed data |

### Auth Module (`auth`)

Keycloak realm configuration management.

| Command | Description |
|---------|-------------|
| `postkit auth export` | Export realm from source Keycloak |
| `postkit auth import` | Import realm config to target Keycloak |
| `postkit auth sync` | Export from source then import to target |

## 📖 Documentation

Full documentation available at: **[https://postkit.appri.dev](https://postkit.appri.dev)**

**Note:** This tool is under active development. APIs and commands may change between versions. We recommend pinning to a specific version in production.

- [Installation Guide](https://postkit.appri.dev/docs/getting-started/installation)
- [Quick Start](https://postkit.appri.dev/docs/getting-started/quick-start)
- [DB Module](https://postkit.appri.dev/docs/modules/db/overview)
- [Auth Module](https://postkit.appri.dev/docs/modules/auth/overview)
- [Configuration](https://postkit.appri.dev/docs/getting-started/configuration)

## 🔧 Configuration

Create a `postkit.config.json` in your project root:

```json
{
  "db": {
    "localDbUrl": "postgres://user:pass@localhost:5432/myapp_local",
    "schemaPath": "db/schema",
    "schema": "public",
    "remotes": {
      "dev": {
        "url": "postgres://user:pass@dev-host:5432/myapp",
        "default": true
      },
      "staging": {
        "url": "postgres://user:pass@staging-host:5432/myapp"
      }
    }
  }
}
```

## 🌐 Global Options

These options are available to all commands:

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose/debug output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output results as JSON (for scripting/CI) |
| `-V, --version` | Output version number |
| `-h, --help` | Display help for command |

## 💡 Typical Workflow

```bash
# 1. Add remotes (first time setup)
postkit db remote add dev "postgres://user:pass@dev-host:5432/myapp" --default
postkit db remote add staging "postgres://user:pass@staging-host:5432/myapp"

# 2. Start a session (clones remote DB locally)
postkit db start

# 3. Make schema changes in db/schema/

# 4. Preview changes
postkit db plan

# 5. Test on local clone
postkit db apply

# 6. Commit when ready
postkit db commit

# 7. Deploy to remote
postkit db deploy --remote staging
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `pgschema is not installed` | Bundled with CLI - verify vendor/ directory exists |
| `dbmate is not installed` | Should be auto-installed - run `npm install` |
| `No remotes configured` | Add a remote with `postkit db remote add <name> <url>` |
| `No active migration session` | Run `postkit db start` first |
| `Deploy failed during dry run` | No changes were made to the target. Fix the issue and retry. |

For more help, see [Troubleshooting](https://postkit.appri.dev/docs/modules/db/troubleshooting) or open an issue on [GitHub](https://github.com/appritechnologies/postkit/issues).

## 🔗 Links

- **npm Package**: https://www.npmjs.com/package/@appritech/postkit
- **Documentation**: https://postkit.appri.dev
- **GitHub**: https://github.com/appritechnologies/postkit
- **Issues**: https://github.com/appritechnologies/postkit/issues

## 📜 License

[Apache-2.0](LICENSE)

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

---

**Built with ❤️ by AppriTeam**
