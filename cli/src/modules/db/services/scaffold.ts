import fs from "fs";
import path from "path";
import {projectRoot} from "../../../common/config";

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
