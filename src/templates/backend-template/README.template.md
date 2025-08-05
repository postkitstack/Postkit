# {{projectName}}

A PostKit project powered by the Appri open-source stack.

## 🚀 **Technology Stack**

- **API Gateway**: [Traefik](https://traefik.io/) (Routing, Load Balancing, Reverse Proxy)
- **Authentication**: [Keycloak](https://www.keycloak.org/) (OAuth2, OpenID Connect, RBAC)
- **CRUD API**: [PostgREST](https://postgrest.org/) (Automated REST API from PostgreSQL)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [DBMate](https://github.com/amacneil/dbmate) (Migrations)
{{#withWorker}}- **Job Queue**: [Graphile Worker](https://github.com/graphile/worker) (Async task processing){{/withWorker}}
{{#withFunctions}}- **Functions Runtime**: [Functions Runtime](https://github.com/appritechnologies/functions-runtime) (Serverless TypeScript/JavaScript functions){{/withFunctions}}
{{#withStorage}}- **Storage**: [PG-Storage](https://github.com/appritechnologies/PG-storage) (Supabase Storage fork)
- **Image Processing**: [ImgProxy](https://imgproxy.net/) (On-the-fly image transformations){{/withStorage}}

---

## 📂 **Project Structure**

```
{{projectName}}/
├── db/                     # Database migrations and utilities
│   ├── migrations/         # Database schema migrations (SQL files)
│   └── utils/              # Database utility scripts
├── auth/                   # Keycloak authentication service
│   ├── config/             # Realm configurations (JSON files)
│   ├── providers/          # Custom Keycloak providers
│   └── readMe.md           # Authentication service documentation
{{#withWorker}}├── worker/                  # Graphile Worker background jobs
│   ├── src/                # TypeScript source code
│   │   ├── tasks/          # Individual task definitions
│   │   ├── services/       # Shared services (database, logger)
│   │   └── types/          # Type definitions
│   ├── package.json        # Node.js dependencies
│   └── tsconfig.json       # TypeScript configuration
{{/withWorker}}{{#withFunctions}}├── functions/              # Serverless TypeScript/JavaScript functions
│   ├── *.ts                # Individual function files
│   ├── package.json        # Node.js dependencies
│   └── README.md           # Functions documentation
{{/withFunctions}}{{#withStorage}}├── storage/               # PG-Storage file management
│   ├── migrations/         # Storage-specific migrations
│   └── readMe.md           # Storage service documentation
{{/withStorage}}├── volumes/                # Docker volumes for persistent data
├── .env                    # Environment variables
├── .dbmate.env             # Database migration configuration
└── docker-compose.yml      # Main service orchestration
```

---

## 🚀 **Getting Started**

### **Prerequisites**
- [Docker](https://www.docker.com/get-started) & [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) (for development)

### **Quick Start**

1. **Start all services:**
   ```bash
   docker-compose up -d
   ```

2. **Access your services:**
   - **API Documentation**: http://swagger.localhost
   - **PostgREST API**: http://rest.localhost
   - **Keycloak Admin**: http://auth.localhost
   - **Traefik Dashboard**: http://traefik.localhost:8080
{{#withFunctions}}   - **Functions API**: http://functions.localhost{{/withFunctions}}
{{#withStorage}}   - **Storage API**: http://storage.localhost
   - **Image Proxy**: http://imgproxy.localhost{{/withStorage}}

3. **Stop all services:**
   ```bash
   docker-compose down
   ```

---

## 🔧 **Development**

### **Environment Configuration**
Environment variables are configured in `.env`. Key configurations:

- **Database**: PostgreSQL connection settings
- **Authentication**: Keycloak admin credentials
- **Security**: JWT secrets and API keys
{{#withFunctions}}- **Functions**: Serverless function configuration{{/withFunctions}}
{{#withStorage}}- **Storage**: File storage configuration{{/withStorage}}

### **Database Migrations**
Database migrations are handled automatically by DBMate:

```bash
# Run migrations manually
docker-compose run migrate up

# Create a new migration
docker-compose run migrate new migration_name
```

{{#withWorker}}### **Background Jobs**
The Graphile Worker service processes background jobs:

```bash
# View worker logs
docker-compose logs -f worker

# Add new job types in services/worker-service/src/tasks/
```
{{/withWorker}}

{{#withFunctions}}### **Serverless Functions**
The Functions Runtime service executes TypeScript/JavaScript functions as HTTP endpoints:

```bash
# View functions logs
docker-compose logs -f functions

# Create a new function
postkit create function user-profile --typescript

# Test a function
curl -X POST http://functions.localhost/user-profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data": "your payload"}'
```

Functions are automatically:
- **Authenticated**: JWT tokens validated via Keycloak
- **Routed**: Available at `/function-name` endpoints
- **Monitored**: Logs and metrics collected
- **Scalable**: Multiple instances supported

Add new functions in `services/functions/` directory.
{{/withFunctions}}

{{#withStorage}}### **File Storage**
PG-Storage provides S3-compatible file storage:

```bash
# Upload files via REST API
curl -X POST http://storage.localhost/object/bucket/filename \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@your-file.jpg"

# Access files
http://storage.localhost/object/public/bucket/filename
```
{{/withStorage}}

---

## 🔐 **Authentication**

Keycloak is configured with:
- **Admin User**: `{{keycloakAdmin}}`
- **Admin Password**: `{{keycloakAdminPassword}}`
- **Realm**: `application`

### **API Authentication**
Include JWT tokens in API requests:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://rest.localhost/your-endpoint
```

---

## 📚 **API Documentation**

- **Interactive API Docs**: http://swagger.localhost
- **PostgREST Schema**: http://rest.localhost/
- **OpenAPI Spec**: http://rest.localhost/

---

## 🛠️ **PostKit CLI Commands**

The PostKit CLI provides comprehensive project management capabilities:

### **Project Management**
```bash
# Initialize a new project
postkit init my-project

# Start services
postkit start              # Start all services
postkit start --dev        # Start in development mode
postkit start --prod       # Start in production mode

# Restart specific service
postkit restart auth       # Restart authentication service
postkit restart worker     # Restart worker service
```

### **Database Operations**
```bash
# Create new migration
postkit migrate:create add_users_table

# Run pending migrations
postkit migrate:up

# Rollback last migration
postkit migrate:down

# Check migration status
postkit migrate:status
```

### **Authentication Management**
```bash
# Import Keycloak realm configuration
postkit auth:import realm.json

# Export Keycloak realm configuration
postkit auth:export my-realm
postkit auth:export my-realm --output ./configs/realm-backup.json
```

### **Development Tools**
```bash
# Create new background task
postkit create task send-email

# Create new serverless function
postkit create function user-profile
postkit create function user-profile --typescript
```

### **Docker Commands**
For direct Docker operations:

| Command | Description |
|---------|-------------|
| `docker-compose up -d` | Start all services in background |
| `docker-compose down` | Stop all services |
| `docker-compose logs -f [service]` | View service logs |
| `docker-compose exec db psql -U {{dbUser}} -d {{projectName}}_db` | Connect to database |

---

## 🏗️ **Deployment**

### **Production Setup**
1. Update environment variables for production
2. Configure SSL certificates in Traefik
3. Set up database backups
4. Configure monitoring and logging

### **Scaling**
Services can be scaled using Docker Compose:

```bash
docker-compose up -d --scale worker=3
```

---

## 📖 **Documentation**

- [PostgREST Documentation](https://postgrest.org/en/stable/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
{{#withWorker}}- [Graphile Worker Documentation](https://github.com/graphile/worker){{/withWorker}}
{{#withFunctions}}- [Functions Runtime Documentation](https://github.com/appritechnologies/functions-runtime){{/withFunctions}}
{{#withStorage}}- [PG-Storage Documentation](https://github.com/appritechnologies/PG-storage){{/withStorage}}

---

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## 📄 **License**

This project is licensed under the MIT License.

---

*Generated by PostKit CLI v{{version}}*