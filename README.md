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
| `-V, --version` | Output version number |
| `-h, --help` | Display help for command |

---

## 🧰 **Available Modules**

| Module | Command | Description | Docs |
|--------|---------|-------------|------|
| **db** | `postkit db <command>` | Session-based database migration workflow | [docs/db.md](docs/db.md) |

### **Example Commands**

```bash
# Database migrations
postkit db start                          # Start a migration session
postkit db plan                           # Generate schema diff
postkit db apply                          # Apply to local clone
postkit db commit "add_users_table"       # Commit to remote
postkit db status                         # Show session state
postkit db abort                          # Cancel session
postkit db grants                         # Manage grant statements
```

---

## 📂 **Project Structure**

```
src/
├── index.ts                  # Main CLI entry point
├── common/                   # Shared utilities (all modules)
│   ├── config.ts             # .env loader & path resolution
│   ├── logger.ts             # Chalk-based logger
│   ├── shell.ts              # Shell command runner
│   └── types.ts              # Shared TypeScript types
└── modules/                  # Pluggable command modules
    └── db/                   # Database migration module
        ├── index.ts          # Module registration
        ├── commands/         # Command handlers
        ├── services/         # Core business logic
        ├── types/            # Module-specific types
        └── utils/            # Module-specific utilities
```

### **Adding a New Module**

1. Create `src/modules/<name>/` with `index.ts`
2. Export a `register<Name>Module(program)` function
3. Import and call it in `src/index.ts`

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
* [PostgREST Docs](https://postgrest.org/en/stable/)
* [Keycloak Docs](https://www.keycloak.org/documentation)
* [Graphile Worker Docs](https://github.com/graphile/worker)

---

## 📄 **License**

ISC

---

**Built with ❤️ by the Appri Team**
