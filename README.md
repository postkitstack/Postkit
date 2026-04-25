# PostKit

> Open-source backend stack for modern applications

PostKit is a full-stack backend toolkit that combines battle-tested open-source technologies into a cohesive, developer-friendly platform. It provides everything you need to build, migrate, and manage production-ready backends.

## The Stack

PostKit brings together the following components:

- **PostgreSQL** – Core database
- **PostgREST** – Auto-generated REST API
- **Keycloak** – Authentication and authorization
- **Graphile Worker** – Background job processing
- **Appri Function Runtime** – Serverless-style JS/TS function handler
- **PG-Storage** – Supabase Storage fork
- **Traefik** – API Gateway and reverse proxy

## PostKit CLI

The PostKit CLI (`@appritech/postkit`) is the developer toolkit for working with the PostKit stack. It provides safe database migrations, auth management, and project scaffolding.

**Documentation:** [https://docs.postkitstack.com/](https://docs.postkitstack.com/)

### Quick Start

```bash
# Install the CLI
npm install -g @appritech/postkit

# Initialize a new project
postkit init

# Start a database migration session
postkit db start
```

See the [CLI README](cli/README.md) for the full command reference.

## AI Agent Skills

PostKit includes Claude Code agent skills that teach AI assistants how to work with PostKit workflows. These are located in `.claude/skills/` and are automatically discovered by Claude Code.

### Available Skills

| Skill | Command | Description |
|-------|---------|-------------|
| `postkit-migrate` | `/postkit-migrate` | Full database migration workflow (start, plan, apply, commit, deploy) |
| `postkit-setup` | `/postkit-setup` | Project initialization, config, and remote management |
| `postkit-schema` | `/postkit-schema` | Working with schema files, infra, grants, and seeds |
| `postkit-auth` | `/postkit-auth` | Keycloak realm export, import, and sync |

### Usage

In Claude Code, invoke any skill with `/skill-name`:

```
/postkit-migrate           # Start the migration workflow
/postkit-setup             # Configure a new project
/postkit-schema            # Help with schema file changes
/postkit-auth              # Sync Keycloak config
```

Claude also loads skills automatically when relevant — for example, editing files under `db/schema/` triggers the `postkit-schema` skill.

### Adding Skills to Your Workspace

The most convenient way is to copy skills to your personal Claude Code directory — they'll be available in **all** your projects:

```bash
cp -r .claude/skills/* ~/.claude/skills/
```

No restart needed — Claude Code picks up changes automatically.

## Documentation

Full documentation is available at [docs.postkitstack.com](https://docs.postkitstack.com/).

For more help, see [Troubleshooting](https://docs.postkitstack.com/docs/modules/db/troubleshooting) or open an issue on [GitHub](https://github.com/appritechnologies/postkit/issues).

## Links

- **CLI Tool**: [cli/README.md](cli/README.md)
- **npm Package**: https://www.npmjs.com/package/@appritech/postkit
- **Documentation**: https://docs.postkitstack.com/
- **GitHub**: https://github.com/appritechnologies/postkit
- **Issues**: https://github.com/appritechnologies/postkit/issues

## License

[Apache-2.0](LICENSE)

---

**Built by AppriTeam**
