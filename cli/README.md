## 📦 **PostKit**

### 🔧 **Overview**

**PostKit** is a modular CLI toolkit designed to streamline development workflows for backend applications using the Appri open-source stack. It provides pluggable command modules for database management, project scaffolding, and more.

The stack includes:

* **PostgreSQL** – Core database
* **PostgREST** – Auto-generated REST API
* **Keycloak** – Authentication and authorization
* **Graphile Worker** – Background job processing
* **Appri Function Runtime** – Serverless-style JS/TS function handler
* **PG-Storage** – Supabase Storage fork
* **Traefik** – API Gateway and reverse proxy

---

### 🎯 **Goals**

* Provide a unified CLI for all backend development tasks
* Modular architecture — each feature is a pluggable module
* Simplify database migrations, project scaffolding, and service management
* Streamline onboarding for new projects and developers

---

## 🚀 **Quick Start**

### **Installation**

```bash
# Install dependencies
npm install

# Build
npm run build

# (Optional) Link globally
npm link
```

### **Usage**

```bash
postkit <module> <command> [options]
```

### **Global Options**

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose/debug output |
| `--dry-run` | Show what would be done without making changes |
| `--json` | Output results as JSON (for scripting/CI) |
| `-V, --version` | Output version number |
| `-h, --help` | Display help for command |

---

## 🧰 **Available Modules**

| Module | Command | Description | Docs |
|--------|---------|-------------|------|
| **db** | `postkit db <command>` | Session-based database migration workflow | [docs/db.md](docs/db.md) |
| **auth** | `postkit auth <command>` | Keycloak realm config management | [docs/auth.md](docs/auth.md) |

### **Example Commands**

```bash
# Initialize project
postkit init

# Database migrations
postkit db remote add dev "postgres://user:pass@host:5432/db" --default
postkit db remote add staging "postgres://user:pass@host:5432/db"
postkit db start                          # Start a migration session (uses default remote)
postkit db start --remote staging         # Start with specific remote
postkit db plan                           # Generate schema diff
postkit db apply                          # Apply to local clone
postkit db commit                         # Commit migrations
postkit db deploy                         # Deploy to default remote
postkit db deploy --remote staging        # Deploy to specific remote
postkit db status                         # Show session state
postkit db abort                          # Cancel session

# Remote management
postkit db remote list                    # List all remotes
postkit db remote add <name> <url>        # Add a new remote
postkit db remote remove <name>           # Remove a remote
postkit db remote use <name>              # Set default remote

# Infrastructure & data
postkit db infra --apply                  # Apply infrastructure (roles, schemas)
postkit db grants --apply                 # Apply grant statements
postkit db seed --apply                   # Apply seed data

# Keycloak auth
postkit auth export                       # Export realm config
postkit auth import                       # Import to target Keycloak
postkit auth sync                         # Export + Import
```

---

## 🧱 **Dependencies**

* **Node.js** >= 18.0.0
* **TypeScript** >= 5.4.0
* **Docker** & Docker Compose (for services)
* **PostgreSQL** CLI (`psql`, `pg_dump`)

---

## 🔧 **Development**

```bash
# Run in development mode
npm run dev -- <module> <command>

# Example
npm run dev -- db status

# Build for production
npm run build
```

---

## 📖 **Documentation**

* [Database Module (postkit db)](docs/db.md)
* [Auth Module (postkit auth)](docs/auth.md)
* [PostgREST Docs](https://postgrest.org/en/stable/)
* [Keycloak Docs](https://www.keycloak.org/documentation)
* [Graphile Worker Docs](https://github.com/graphile/worker)

---

## 📄 **License**

ISC

---

**Built with ❤️ by the Appri Team**
