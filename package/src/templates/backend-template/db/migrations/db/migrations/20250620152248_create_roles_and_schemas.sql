-- migrate:up

-- Create schemas if they don't exist
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS auth;

-- Create the main authenticator role (used by PostgREST)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;

-- Create anon role (for unauthenticated requests)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;

-- Create service role (for administrative/system operations)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;

-- Create application-specific roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_admin') THEN
        CREATE ROLE app_admin NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;


DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'contractor') THEN
        CREATE ROLE contractor NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;

-- Grant roles to authenticator
GRANT anon TO authenticator;
GRANT service_role TO authenticator;
GRANT app_admin TO authenticator;
GRANT contractor TO authenticator;

-- Grant USAGE permission on storage schema to all roles
GRANT USAGE ON SCHEMA storage TO app_admin;
GRANT USAGE ON SCHEMA storage TO contractor;
GRANT USAGE ON SCHEMA storage TO authenticator;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT USAGE ON SCHEMA storage TO anon;

-- Grant USAGE permission on auth schema to all roles
GRANT USAGE ON SCHEMA auth TO app_admin;
GRANT USAGE ON SCHEMA auth TO contractor;
GRANT USAGE ON SCHEMA auth TO authenticator;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT USAGE ON SCHEMA auth TO anon;

-- Grant USAGE on public schema
GRANT USAGE ON SCHEMA public TO app_admin;
GRANT USAGE ON SCHEMA public TO contractor;
GRANT USAGE ON SCHEMA public TO authenticator;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- migrate:down

-- Revoke default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon;

-- Revoke schema permissions
REVOKE USAGE ON SCHEMA public FROM anon, service_role, authenticator, contractor, app_admin;
REVOKE USAGE ON SCHEMA auth FROM anon, service_role, authenticator, contractor, app_admin;
REVOKE USAGE ON SCHEMA storage FROM anon, service_role, authenticator, contractor, app_admin;

-- Revoke role grants from authenticator
REVOKE contractor FROM authenticator;
REVOKE app_admin FROM authenticator;
REVOKE service_role FROM authenticator;
REVOKE anon FROM authenticator;

-- Drop roles
DROP ROLE IF EXISTS contractor;
DROP ROLE IF EXISTS app_admin;
DROP ROLE IF EXISTS service_role;
DROP ROLE IF EXISTS anon;
DROP ROLE IF EXISTS authenticator;