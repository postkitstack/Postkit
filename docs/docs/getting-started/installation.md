---
sidebar_position: 1
---

# Installation

Install the PostKit CLI, one of the tools in the PostKit framework.

## Requirements

- **Node.js** >= 18.0.0
- **TypeScript** >= 5.4.0
- **Docker** & Docker Compose (for services)
- **PostgreSQL** CLI tools (`psql`, `pg_dump`)

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
