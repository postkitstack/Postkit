# 🚀 PostKit CLI

A powerful CLI tool for initializing and managing PostKit projects with the complete Appri open-source stack.

## 📦 **What is PostKit?**

PostKit streamlines the setup and management of backend applications using modern, production-ready technologies:

* **PostgreSQL** – Core database
* **PostgREST** – Auto-generated REST API
* **Keycloak** – Authentication and authorization  
* **Graphile Worker** – Background job processing
* **Functions Runtime** – Serverless-style function handler
* **PG-Storage** – Supabase Storage fork
* **Traefik** – API Gateway and reverse proxy

---

## 🎯 **Features**

✅ **One-Command Setup** - Initialize complete projects instantly  
✅ **Interactive Configuration** - Guided setup with sensible defaults  
✅ **Modular Services** - Choose what you need (Worker, Storage, Functions, etc.)  
✅ **Docker Integration** - Full containerization with Docker Compose  
✅ **Environment Management** - Automated .env generation with secure keys  
✅ **Service Management** - Start, stop, restart individual services  
✅ **Task Generation** - Create Graphile Worker tasks automatically  
✅ **Migration Management** - Run database migrations with ease  
✅ **Production Ready** - Health checks, service dependencies, and profiles

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

## 🛠️ **Available Commands**

| Command | Description |
|---------|-------------|
| `postkit init <name>` | Initialize a new PostKit project |
| `postkit start [--dev\|--prod]` | Start services in development or production mode |
| `postkit restart <service>` | Restart a specific service |
| `postkit create task <name>` | Create a new Graphile Worker task |
| `postkit create function <name>` | Create a new serverless function |
| `postkit migrate [--up\|--down\|--status]` | Run database migrations |

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

# Run migrations
postkit migrate --up
postkit migrate --status
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

## 📂 **Generated Project Structure**

```
my-awesome-app/
├── db/                     # Database migrations and utilities
│   ├── migrations/         # Schema migrations (DBMate)
│   └── utils/              # Database utility scripts
├── services/               # Microservices
│   ├── auth/               # Keycloak configuration
│   ├── worker-service/     # Background jobs (optional)
│   ├── functions/          # Serverless functions (optional)
│   ├── storage/            # File storage (optional)
│   └── pg_rest/            # PostgREST configuration
├── volumes/                # Docker volumes
├── .env                    # Environment variables
├── docker-compose.yml      # Service orchestration  
└── README.md               # Project documentation
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

## 🔧 **Development**

### **Project Structure**

```
src/
├── cli.js              # Main CLI entry point
├── commands/           # Command implementations  
│   ├── init.js         # Project initialization
│   ├── dev.js          # Development environment
│   └── prod.js         # Production environment
├── templates/          # Project templates
│   ├── docker-compose.template.yml
│   ├── .env.template
│   ├── README.template.md
│   └── services/       # Service templates
└── utils/              # Utility modules
    ├── logger.js       # Colored logging
    ├── docker.js       # Docker operations
    └── file-utils.js   # File operations
```

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