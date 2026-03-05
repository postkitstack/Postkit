## 📦 **Project Specification: PostKit**

### 🔧 **Overview**

**PostKit** is a CLI tool designed to streamline the setup process for backend applications using the Appri open-source stack. It helps developers scaffold the file structure, initialize database migrations, and prepare project environments with best practices.

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

* Scaffold project folder with all required structure and configuration
* Bootstrap a Postgres database with initial migrations
* Configure connections for PostgREST, Keycloak, and Graphile Worker
* Simplify onboarding for new projects and new developers

---

### 🧰 **Core Features**

#### 1. **CLI Initialization**

```bash
postkit init my-app
```

* Creates the full project directory
* Prompts user for:
  * Project name
  * Database credentials
  * Keycloak admin credentials
  * Environment (development/production)
  * Enable optional components (Worker, Storage, Functions)

#### 2. **File Structure Generation**

Creates a modular backend structure:

```
my-app/
├── db/
│   ├── migrations/         # SQL migration files
│   └── utils/              # Database utility scripts
├── auth/                   # Keycloak authentication service
│   ├── config/             # Realm configurations (JSON files)
│   └── providers/          # Custom Keycloak providers
├── functions/              # Appri runtime functions (optional)
│   ├── *.ts                # Individual function files
│   └── package.json        # Node.js dependencies
├── worker/                 # Graphile worker jobs (optional)
│   ├── src/
│   │   ├── tasks/          # Job task definitions
│   │   └── services/       # Shared services
│   └── package.json        # Node.js dependencies
├── storage/                # PG-Storage setup (optional)
├── .env                    # Environment variables
├── .dbmate.env             # Database migration config
└── docker-compose.yml      # Service orchestration
```

#### 3. **Initial Database Migrations**

* Generates a default schema migration with:
  * Users table (linked to Keycloak)
  * Roles and permissions
  * Basic audit fields (created_at, updated_at)
* Includes sample tables for common use cases

#### 4. **PostgREST Configuration**

* Auto-generates PostgREST configuration
* Maps environment variables
* Supports RLS template scaffolding

#### 5. **Keycloak Integration**

* Adds Keycloak service configuration
* Prepares example Keycloak realm and client config files
* Realm import/export capabilities via Admin API

#### 6. **Graphile Worker Support**

* Optional flag `--with-worker`
* Adds job runner scaffolding
* Includes sample jobs: `send_email`, `audit_log`

#### 7. **Function Runtime Bootstrap**

* Creates base `functions/hello.ts`
* Includes routing template and request/response interfaces
* TypeScript support with proper package.json

---

## 🚀 **Quick Start**

### **Installation**

```bash
# Install dependencies
npm install

# Make CLI executable
chmod +x src/cli.js
```

### **Initialize a New Project**

```bash
# Create a new PostKit project
./src/cli.js init my-awesome-app

# Or using npm
npm run start init my-awesome-app
```

### **Interactive Setup**
The CLI will prompt you for:
- Database credentials
- Keycloak admin credentials  
- Environment (development/production)
- Optional services (Worker, Storage, Functions)

### **Start Development**

```bash
cd my-awesome-app

# Start all services
docker-compose up -d

# Or use PostKit commands
postkit start --dev
```

---

### 🚀 **Planned Commands**

| Command                     | Description                         | Status |
| --------------------------- | ----------------------------------- | ------ |
| `postkit init <name>`       | Scaffold a new project              | ✅ Done |
| `postkit start [options]`   | Start services (dev/prod modes)    | ✅ Done |
| `postkit restart <service>` | Restart specific service            | ✅ Done |
| `postkit migrate:create`    | Create new migration file           | ✅ Done |
| `postkit migrate:up`        | Apply pending migrations            | ✅ Done |
| `postkit migrate:down`      | Rollback last migration             | ✅ Done |
| `postkit migrate:status`    | Show migration status               | ✅ Done |
| `postkit auth:import`       | Import Keycloak realm configuration | ✅ Done |
| `postkit auth:export`       | Export Keycloak realm configuration | ✅ Done |
| `postkit create task`       | Create new Graphile Worker task     | ✅ Done |
| `postkit create function`   | Create new serverless function      | ✅ Done |
| `postkit help`              | Show detailed CLI help              | ✅ Done |

### **Command Examples**

```bash
# Initialize a new project
postkit init my-app --with-functions --with-worker

# Start in development mode
postkit start --dev

# Start specific services
postkit start --dev --services worker,functions

# Restart a service
postkit restart keycloak

# Create a new task
postkit create task send-email

# Create a new function
postkit create function user-profile
postkit create function get-data --typescript

# Database migrations
postkit migrate:create add_users_table
postkit migrate:up
postkit migrate:status

# Authentication management
postkit auth:export my-realm
postkit auth:import realm-config.json
```

### **Init Command Options**

```bash
postkit init my-app [options]

Options:
  --with-worker     Include Graphile Worker service (default: true)
  --with-storage    Include PG-Storage service (default: true)
  --with-functions  Include Functions Runtime service (default: true)
  --skip-docker     Skip automatic Docker startup
  -h, --help        Display help
```

---

## 📂 **PostKit CLI Project Structure**

### **CLI Source Code**
```
src/
├── cli/
│   ├── index.js            # Main CLI entry point  
│   ├── commands/           # Command implementations
│   │   ├── init.js         # Project initialization
│   │   ├── start.js        # Service management
│   │   ├── restart.js      # Service restart
│   │   ├── create.js       # Component generation
│   │   ├── migrate-*.js    # Database migration commands
│   │   ├── auth-import.js  # Keycloak realm import
│   │   ├── auth-export.js  # Keycloak realm export
│   │   └── help.js         # Interactive help system
│   └── utils/              # Utility modules
│       ├── logger.js       # Colored logging
│       ├── docker.js       # Docker operations
│       └── file-utils.js   # File operations
└── templates/
    └── backend-template/   # Project templates
        ├── db/             # Database templates
        ├── services/       # Service templates
        │   ├── auth/       # Keycloak templates
        │   ├── functions/  # Function templates
        │   ├── worker-service/ # Worker templates
        │   └── storage/    # Storage templates
        ├── docker-compose.template.yml
        ├── .env.template
        └── README.template.md
```

### **Generated Project Structure**
```
my-app/
├── db/
│   ├── migrations/         # SQL migration files
│   └── utils/              # Database utility scripts
├── auth/                   # Keycloak authentication service
│   ├── config/             # Realm configurations (JSON files)
│   └── providers/          # Custom Keycloak providers
├── functions/              # Appri runtime functions (optional)
│   ├── *.ts                # Individual function files
│   └── package.json        # Node.js dependencies
├── worker/                 # Graphile worker jobs (optional)
│   ├── src/
│   │   ├── tasks/          # Job task definitions
│   │   └── services/       # Shared services
│   └── package.json        # Node.js dependencies
├── storage/                # PG-Storage setup (optional)
│   └── migrations/         # Storage-specific migrations
├── volumes/                # Docker volumes for persistence
├── .env                    # Environment variables
├── .dbmate.env             # Database migration configuration
├── docker-compose.yml      # Service orchestration
└── README.md               # Generated project documentation
```

---

## 🌐 **Default Service URLs**

After initialization, access your services at:

- **API Documentation**: http://swagger.localhost
- **PostgREST API**: http://rest.localhost  
- **Keycloak Admin**: http://auth.localhost
- **Traefik Dashboard**: http://traefik.localhost:8080
- **Storage API**: http://storage.localhost *(if enabled)*
- **Image Proxy**: http://imgproxy.localhost *(if enabled)*

---

### 🧱 **Dependencies**

* Node.js >= 18.0.0 (CLI runtime)
* Docker & Docker Compose (recommended for services)
* PostgreSQL CLI (`psql`) - for direct database access
* `dbmate` - for database migrations
* Keycloak Admin CLI (optional) - for realm management

---

## 🔧 **Development**

### **Adding New Templates**

1. Add template files to `src/templates/`
2. Use Mustache syntax for variables: `{{projectName}}`
3. Update `src/commands/init.js` to copy new templates

### **Template Variables**

Available variables in templates:
- `{{projectName}}` - Project name
- `{{dbUser}}` - Database username  
- `{{dbPassword}}` - Database password
- `{{keycloakAdmin}}` - Keycloak admin username
- `{{jwtSecret}}` - JWT secret key
- `{{nodeEnv}}` - Environment (development/production)
- `{{withWorker}}` - Boolean for worker service
- `{{withStorage}}` - Boolean for storage service

---

## 🔐 **Security Features**

- **Auto-generated Secrets** - JWT keys, API keys, and signing keys
- **Secure Defaults** - Production-ready configurations
- **Environment Isolation** - Proper .env file generation
- **No Hardcoded Credentials** - All secrets are configurable

---

## 🐳 **Docker Integration**

PostKit uses Docker Compose profiles for optional services:

```bash
# Start with worker service
docker-compose --profile worker up -d

# Start with storage services  
docker-compose --profile storage up -d

# Start everything
docker-compose --profile worker --profile storage up -d
```

---

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Add your changes
4. Test with a sample project
5. Submit a pull request

---

## 📋 **Requirements**

- **Node.js** >= 16.0.0
- **Docker** & **Docker Compose**
- **Git** (for cloning)

---

## 📖 **Documentation**

- [PostgREST Docs](https://postgrest.org/en/stable/)
- [Keycloak Docs](https://www.keycloak.org/documentation)  
- [Graphile Worker Docs](https://github.com/graphile/worker)
- [Docker Compose Docs](https://docs.docker.com/compose/)

---

## 📄 **License**

MIT License - see LICENSE file for details.

---

**Built with ❤️ by the Appri Team**