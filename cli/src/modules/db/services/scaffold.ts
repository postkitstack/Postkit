import fs from "fs";
import path from "path";
import {projectRoot} from "../../../common/config";
import {getCommittedMigrationsPath, toRelativePath} from "../utils/db-config";
import {getAllCommittedMigrations, addCommittedMigration} from "../utils/committed";

const ROLES_SQL = `DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOSUPERUSER INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOSUPERUSER INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator LOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END
$$;
`;

const SCHEMAS_SQL = `CREATE SCHEMA IF NOT EXISTS public;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE SCHEMA IF NOT EXISTS storage;
`;

/**
 * Scaffold db/infra/ with 001_roles.sql and 002_schemas.sql for PostgREST.
 * Safe to call multiple times — never overwrites existing files.
 * Returns true if any file was created, false if all already existed.
 */
export function scaffoldDbInfra(): boolean {
  const infraDir = path.join(projectRoot, "db", "infra");
  fs.mkdirSync(infraDir, {recursive: true});

  let created = false;

  const rolesFile = path.join(infraDir, "001_roles.sql");
  if (!fs.existsSync(rolesFile)) {
    fs.writeFileSync(rolesFile, ROLES_SQL);
    created = true;
  }

  const schemasFile = path.join(infraDir, "002_schemas.sql");
  if (!fs.existsSync(schemasFile)) {
    fs.writeFileSync(schemasFile, SCHEMAS_SQL);
    created = true;
  }

  return created;
}

// Fixed (not wall-clock) timestamp so the file name is stable across `postkit init`
// re-runs and sorts before any real migration in .postkit/db/migrations/.
const STORAGE_MIGRATION_TIMESTAMP = "00000000000001";
const STORAGE_MIGRATION_NAME = `${STORAGE_MIGRATION_TIMESTAMP}_create_storage_migrations_table.sql`;
const STORAGE_MIGRATION_DESCRIPTION = "create storage.migrations table";

const STORAGE_MIGRATION_SQL = `-- migrate:up
-- If you don't run a storage service (e.g. Supabase storage-api) against the
-- storage schema, this migration is unused — delete this file and its entry
-- in .postkit/db/committed.json.
CREATE TABLE IF NOT EXISTS storage.migrations (
    id INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    hash VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- migrate:down
DROP TABLE IF EXISTS storage.migrations;
`;

/**
 * Scaffold a committed migration that creates storage.migrations — the migration
 * tracking table expected by storage services (e.g. Supabase's storage-api) run
 * against the `storage` schema. Runs unconditionally as part of `postkit init`.
 * Safe to call multiple times — never overwrites an existing migration file.
 * Returns true if the migration was created, false if it already existed.
 */
export async function scaffoldStorageMigration(): Promise<boolean> {
  const migrationsDir = getCommittedMigrationsPath();
  fs.mkdirSync(migrationsDir, {recursive: true});

  const migrationPath = path.join(migrationsDir, STORAGE_MIGRATION_NAME);
  if (fs.existsSync(migrationPath)) {
    return false;
  }

  fs.writeFileSync(migrationPath, STORAGE_MIGRATION_SQL);

  const existing = await getAllCommittedMigrations();
  const alreadyTracked = existing.some((m) => m.migrationFile.name === STORAGE_MIGRATION_NAME);

  if (!alreadyTracked) {
    await addCommittedMigration({
      migrationFile: {
        name: STORAGE_MIGRATION_NAME,
        path: toRelativePath(migrationPath),
        timestamp: STORAGE_MIGRATION_TIMESTAMP,
      },
      description: STORAGE_MIGRATION_DESCRIPTION,
      sessionMigrations: [],
      committedAt: new Date().toISOString(),
    });
  }

  return true;
}
