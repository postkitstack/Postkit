import {MIGRATIONS_TABLE} from "../utils/db-config";

// ============================================
// Connection & Health Check
// ============================================

export const TEST_CONNECTION = "SELECT 1";

export const CHECK_DB_EXISTS = "SELECT 1 FROM pg_database WHERE datname = $1";

export const CREATE_POSTKIT_SCHEMA = "CREATE SCHEMA IF NOT EXISTS postkit";

export const TERMINATE_CONNECTIONS = `
  SELECT pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pg_stat_activity.datname = $1
    AND pid <> pg_backend_pid()`;

export const COUNT_TABLES = `
  SELECT COUNT(*) as count
  FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    AND table_type = 'BASE TABLE'`;

// ============================================
// Migration Tracking
// ============================================

export const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    version VARCHAR(128) NOT NULL PRIMARY KEY
  )`;

export const INSERT_MIGRATION_VERSION = `
  INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`;

export const CHECK_MIGRATIONS_TABLE_EXISTS = `
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'postkit' AND table_name = 'schema_migrations' LIMIT 1`;

export const GET_APPLIED_VERSIONS = `SELECT version FROM ${MIGRATIONS_TABLE}`;

// ============================================
// Infra: Schemas & Roles
// ============================================

export const FETCH_SCHEMAS = `
  SELECT nspname, pg_catalog.pg_get_userbyid(nspowner) AS owner
  FROM pg_catalog.pg_namespace
  WHERE nspname NOT LIKE 'pg_%'
    AND nspname != 'information_schema'
  ORDER BY nspname`;

export const FETCH_ROLES = `
  SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
          rolcanlogin, rolreplication, rolconnlimit
  FROM pg_catalog.pg_roles
  WHERE rolname NOT LIKE 'pg_%'
  ORDER BY rolname`;
