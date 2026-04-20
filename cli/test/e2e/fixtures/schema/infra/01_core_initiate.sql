-- Create schemas if they don't exist
CREATE SCHEMA IF NOT EXISTS public;

-- Create API gateway role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'api_user') THEN
        CREATE ROLE api_user LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;

-- Create read-only role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'readonly') THEN
        CREATE ROLE readonly NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;

-- Create editor role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'editor') THEN
        CREATE ROLE editor NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;

-- Create manager role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'manager') THEN
        CREATE ROLE manager NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
    END IF;
END
$$;
