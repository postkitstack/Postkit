---
sidebar_position: 1
---

# PostKit

**PostKit** is a framework designed to streamline development workflows for backend applications using the Appri open-source stack.

## Tools

PostKit includes a modular CLI toolkit with the following tools:

- **CLI** - Command-line interface for database migrations, auth management, and more
- More tools coming soon...

## Features

- **Session-based database migrations** - Clone remote databases locally, develop and test changes safely, then deploy with confidence
- **Modular architecture** - Each feature is a pluggable module (database, auth, and more coming soon)
- **Safe deployments** - Dry-run verification ensures your migrations work before touching production

## The Stack

PostKit is built for the Appri stack:

- **PostgreSQL** - Core database
- **PostgREST** - Auto-generated REST API
- **Keycloak** - Authentication and authorization
- **Graphile Worker** - Background job processing
- **Appri Function Runtime** - Serverless-style JS/TS function handler
- **PG-Storage** - Supabase Storage fork
- **Traefik** - API Gateway and reverse proxy

## Quick Start

```bash
# Install CLI
npm install -g @appri/postkit

# Initialize a new project
postkit init

# Start a database migration session
postkit db start
```

## CLI Modules

| Module | Description |
|--------|-------------|
| [`db`](/docs/modules/db/overview) | Session-based database migration workflow |
| [`auth`](/docs/modules/auth/overview) | Keycloak realm configuration management |
