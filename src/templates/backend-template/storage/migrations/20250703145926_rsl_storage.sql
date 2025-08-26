-- migrate:up

-- =====================================================
-- SERVICE ROLE SETUP
-- =====================================================

-- Grant all privileges on storage schema to service_role
GRANT ALL PRIVILEGES ON SCHEMA storage TO service_role;

-- Grant all privileges on all existing tables in storage schema to service_role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA storage TO service_role;

-- Grant all privileges on all sequences in storage schema to service_role
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA storage TO service_role;

-- Grant all privileges on all functions in storage schema to service_role
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA storage TO service_role;

-- Set default privileges for future objects in storage schema
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON FUNCTIONS TO service_role;

-- Grant USAGE permission on storage schema to all roles
GRANT USAGE ON SCHEMA storage TO app_admin;
GRANT USAGE ON SCHEMA storage TO contractor;
GRANT USAGE ON SCHEMA storage TO authenticator;
GRANT USAGE ON SCHEMA storage TO service_role;

-- =====================================================
-- STEP 1: TABLE-LEVEL PERMISSIONS SETUP
-- =====================================================

-- =====================================================
-- 1.1: Grant permissions on storage.buckets
-- =====================================================

-- app_admin and Account Manager: Full permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets TO app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets TO account_manager;

-- Other roles: Read-only permissions
GRANT SELECT ON storage.buckets TO client;
GRANT SELECT ON storage.buckets TO contract_employee;
GRANT SELECT ON storage.buckets TO contractor;
GRANT SELECT ON storage.buckets TO employee;

-- =====================================================
-- 1.2: Grant permissions on storage.objects
-- =====================================================

-- app_admin and Account Manager: Full permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO account_manager;

-- Other roles: SELECT and INSERT permissions (UPDATE/DELETE will be controlled by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO client;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO contract_employee;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO contractor;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO employee;

-- =====================================================
-- 1.3: Grant permissions on storage.prefixes
-- =====================================================

-- Service role: Full permissions (super app_admin behavior)
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.prefixes TO service_role;

-- Other roles: Read-only permissions
GRANT SELECT ON storage.prefixes TO app_admin;
GRANT SELECT ON storage.prefixes TO account_manager;
GRANT SELECT ON storage.prefixes TO client;
GRANT SELECT ON storage.prefixes TO contract_employee;
GRANT SELECT ON storage.prefixes TO contractor;
GRANT SELECT ON storage.prefixes TO employee;

-- =====================================================
-- STEP 2: ENABLE ROW-LEVEL SECURITY
-- =====================================================

-- Enable RLS on storage tables
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 3: CREATE RLS POLICIES FOR storage.buckets
-- =====================================================

-- Policy 1: Service Role - Full access to all buckets (super app_admin behavior)
CREATE POLICY "service_role_full_access_buckets"
ON storage.buckets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy 2: app_admin - Full access to all buckets
CREATE POLICY "app_admin_full_access_buckets"
ON storage.buckets
FOR ALL
TO app_admin
USING (true)
WITH CHECK (true);

-- Policy 3: Account Manager - Full access to all buckets
CREATE POLICY "account_manager_full_access_buckets"
ON storage.buckets
FOR ALL
TO account_manager
USING (true)
WITH CHECK (true);

-- Policy 4: Other roles - Read-only access to all buckets
CREATE POLICY "others_read_only_buckets"
ON storage.buckets
FOR SELECT
TO client, contract_employee, contractor, employee
USING (true);

-- =====================================================
-- STEP 4: CREATE RLS POLICIES FOR storage.objects
-- =====================================================


-- Policy 1: Service Role - Full access to all objects (super app_admin behavior)
CREATE POLICY "service_role_full_access_objects"
ON storage.objects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy 2: app_admin - Full access to all objects
CREATE POLICY "app_admin_full_access_objects"
ON storage.objects
FOR ALL
TO app_admin
USING (true)
WITH CHECK (true);

-- Policy 3: Account Manager - Full access to all objects
CREATE POLICY "account_manager_full_access_objects"
ON storage.objects
FOR ALL
TO account_manager
USING (true)
WITH CHECK (true);


-- Policy 4: Other roles - Read access to all objects
CREATE POLICY "others_read_all_objects"
ON storage.objects
FOR SELECT
TO client, contract_employee, contractor, employee
USING (true);

-- Policy 5: Other roles - Insert new objects (with ownership)




CREATE POLICY "others_insert_objects"
ON storage.objects
FOR INSERT
TO client, contract_employee, contractor, employee
WITH CHECK (true);

-- Policy 6: Other roles - Update only their own objects
CREATE POLICY "others_update_own_objects"
ON storage.objects
FOR UPDATE
TO client, contract_employee, contractor, employee
USING (owner = auth.uid())
WITH CHECK (true);

-- Policy 7: Other roles - Delete only their own objects
CREATE POLICY "others_delete_own_objects"
ON storage.objects
FOR DELETE
TO client, contract_employee, contractor, employee
USING (owner = auth.uid());

-- =====================================================
-- STEP 5: CREATE RLS POLICIES FOR storage.prefixes
-- =====================================================

-- Policy 1: Service Role - Full access to all prefixes (super admin behavior)
CREATE POLICY "service_role_full_access_prefixes"
ON storage.prefixes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy 2: All other roles - Read-only access to all prefixes
CREATE POLICY "others_read_only_prefixes"
ON storage.prefixes
FOR SELECT
TO app_admin, account_manager, client, contract_employee, contractor, employee
USING (true);

-- migrate:down

-- =====================================================
-- STEP 1: DROP ALL RLS POLICIES
-- =====================================================

-- Drop policies for storage.buckets
DROP POLICY IF EXISTS "service_role_full_access_buckets" ON storage.buckets;
DROP POLICY IF EXISTS "app_admin_full_access_buckets" ON storage.buckets;
DROP POLICY IF EXISTS "account_manager_full_access_buckets" ON storage.buckets;
DROP POLICY IF EXISTS "others_read_only_buckets" ON storage.buckets;

-- Drop policies for storage.objects
DROP POLICY IF EXISTS "service_role_full_access_objects" ON storage.objects;
DROP POLICY IF EXISTS "app_admin_full_access_objects" ON storage.objects;
DROP POLICY IF EXISTS "account_manager_full_access_objects" ON storage.objects;
DROP POLICY IF EXISTS "others_read_all_objects" ON storage.objects;
DROP POLICY IF EXISTS "others_insert_objects" ON storage.objects;
DROP POLICY IF EXISTS "others_update_own_objects" ON storage.objects;
DROP POLICY IF EXISTS "others_delete_own_objects" ON storage.objects;

-- Drop policies for storage.prefixes
DROP POLICY IF EXISTS "service_role_full_access_prefixes" ON storage.prefixes;
DROP POLICY IF EXISTS "others_read_only_prefixes" ON storage.prefixes;

-- =====================================================
-- STEP 2: DISABLE ROW-LEVEL SECURITY
-- =====================================================

ALTER TABLE storage.buckets DISABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
ALTER TABLE storage.prefixes DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 3: REVOKE TABLE-LEVEL PERMISSIONS
-- =====================================================

-- Revoke permissions on storage.buckets
REVOKE ALL ON storage.buckets FROM app_admin;
REVOKE ALL ON storage.buckets FROM service_role;
REVOKE ALL ON storage.buckets FROM account_manager;
REVOKE ALL ON storage.buckets FROM client;
REVOKE ALL ON storage.buckets FROM contract_employee;
REVOKE ALL ON storage.buckets FROM contractor;
REVOKE ALL ON storage.buckets FROM employee;

-- Revoke permissions on storage.objects
REVOKE ALL ON storage.objects FROM app_admin;
REVOKE ALL ON storage.objects FROM service_role;
REVOKE ALL ON storage.objects FROM account_manager;
REVOKE ALL ON storage.objects FROM client;
REVOKE ALL ON storage.objects FROM contract_employee;
REVOKE ALL ON storage.objects FROM contractor;
REVOKE ALL ON storage.objects FROM employee;

-- Revoke permissions on storage.prefixes
REVOKE ALL ON storage.prefixes FROM service_role;
REVOKE ALL ON storage.prefixes FROM app_admin;
REVOKE ALL ON storage.prefixes FROM account_manager;
REVOKE ALL ON storage.prefixes FROM client;
REVOKE ALL ON storage.prefixes FROM contract_employee;
REVOKE ALL ON storage.prefixes FROM contractor;
REVOKE ALL ON storage.prefixes FROM employee;

-- =====================================================
-- STEP 4: REVOKE SCHEMA-LEVEL PERMISSIONS
-- =====================================================

-- Revoke USAGE permission on storage schema
REVOKE USAGE ON SCHEMA storage FROM account_manager;
REVOKE USAGE ON SCHEMA storage FROM app_admin;
REVOKE USAGE ON SCHEMA storage FROM client;
REVOKE USAGE ON SCHEMA storage FROM employee;
REVOKE USAGE ON SCHEMA storage FROM contract_employee;
REVOKE USAGE ON SCHEMA storage FROM contractor;
REVOKE USAGE ON SCHEMA storage FROM authenticator;
REVOKE USAGE ON SCHEMA storage FROM service_role;

-- Reset default privileges for future objects in storage schema
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE ALL ON TABLES FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE ALL ON SEQUENCES FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE ALL ON FUNCTIONS FROM service_role;

-- Revoke all privileges on storage schema from service_role
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA storage FROM service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA storage FROM service_role;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA storage FROM service_role;
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM service_role;



