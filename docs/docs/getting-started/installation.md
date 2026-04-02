---
sidebar_position: 1
---

# Installation

Install the PostKit CLI, one of the tools in the PostKit framework.

## Requirements

Before installing PostKit CLI, ensure you have the following:

| Requirement | Version | Download |
|-------------|---------|----------|
| **Node.js** | >= 18.0.0 | [nodejs.org](https://nodejs.org/) |
| **npm** | (comes with Node.js) | [npmjs.com](https://www.npmjs.com/) |
| **Docker** | Latest | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Docker Compose** | (comes with Docker Desktop) | Included with Docker Desktop |
| **PostgreSQL CLI** | `psql`, `pg_dump` | [postgresql.org/download](https://www.postgresql.org/download/) |

### Installing Prerequisites

**Node.js & npm:**
```bash
# Verify installation
node --version
npm --version
```

**Docker:**
- Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Verify installation: `docker --version`

**PostgreSQL CLI:**
- **macOS:** `brew install postgresql`
- **Ubuntu/Debian:** `sudo apt-get install postgresql-client`
- **Windows:** Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- Verify installation: `psql --version`

## Install PostKit CLI

### From npm

```bash
npm install -g @appri/postkit
```

### From source

```bash
# Clone the repository
git clone https://github.com/appri/postkit.git
cd postkit/cli

# Install dependencies
npm install

# Build
npm run build

# Link globally
npm link
```

## Verify Installation

```bash
postkit --version
postkit --help
```

## Development Mode

For development, you can run the CLI directly from source without building:

```bash
cd /path/to/postkit/cli
npm run dev -- <module> <command>

# Example
npm run dev -- db status
```
