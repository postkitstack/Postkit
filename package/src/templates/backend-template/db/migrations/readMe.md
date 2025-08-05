# Database Migrations with db-mate

Database schema management using db-mate migration tool.

## Configuration

### Environment Variables
```bash
DATABASE_URL=
```

**Note**: Set your PostgreSQL connection string (e.g., `postgresql://user:password@host:port/database`)

## Installation

Install db-mate:
```bash
# macOS
brew install dbmate

# Linux/Windows
curl -fsSL -o /usr/local/bin/dbmate https://github.com/amacneil/dbmate/releases/latest/download/dbmate-linux-amd64
chmod +x /usr/local/bin/dbmate
```

## Commands

### Create New Migration
```bash
dbmate new migration_name
```
Creates a new migration file in `db/migrations/` directory.

### Apply Migrations (Up)
```bash
dbmate up
```
Runs all pending migrations to update the database schema.

### Rollback Migrations (Down)
```bash
dbmate down
```
Rolls back the last applied migration.

## Usage Example

```bash
# Create a new migration
dbmate new create_users_table

# Apply all pending migrations
dbmate up

# Rollback last migration
dbmate down
```