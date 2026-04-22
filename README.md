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
