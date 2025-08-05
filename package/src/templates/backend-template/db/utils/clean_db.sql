
-- Disable foreign key constraints temporarily
SET session_replication_role = 'replica';

-- Drop all tables
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE'; 
    END LOOP;
END $$;

-- Drop all sequences
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP 
        EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequencename) || ' CASCADE'; 
    END LOOP;
END $$;

-- Drop all functions
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type='FUNCTION') LOOP 
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.routine_name) || ' CASCADE'; 
    END LOOP;
END $$;

-- Drop all triggers
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public') LOOP 
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON ' || quote_ident(r.event_object_table) || ' CASCADE'; 
    END LOOP;
END $$;

-- Drop all views
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') LOOP 
        EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.table_name) || ' CASCADE'; 
    END LOOP;
END $$;

-- Drop all types (ENUMs)
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typcategory = 'E') LOOP 
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE'; 
    END LOOP;
END $$;

-- Re-enable foreign key constraints
SET session_replication_role = 'origin';

-- Verify cleanup
SELECT 'Cleanup complete! All tables, functions, triggers, sequences, views, and types are dropped.' AS message;
