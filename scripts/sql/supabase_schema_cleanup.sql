-- Supabase Schema Cleanup Script for CRM Admin
-- Version 1.0
-- This script attempts to reverse the operations performed by supabase_schema_setup.sql

--------------------------------------
-- 1. DROP DATABASE FUNCTIONS (RPC)
--------------------------------------
-- Revoke grants first if any were specifically made to roles other than the owner for security definer functions
-- The GRANT EXECUTE ON FUNCTION public.normalize_staged_leads(TEXT) TO authenticated; was made.
-- However, dropping the function should generally handle this. If issues arise, manual REVOKE might be needed.

DROP FUNCTION IF EXISTS public.normalize_staged_leads(TEXT) CASCADE;

--------------------------------------
-- 2. DROP TABLES (in reverse order of creation)
--------------------------------------
-- Using CASCADE will also drop dependent objects like foreign key constraints, indexes, triggers, and RLS policies attached to these tables.

DROP TABLE IF EXISTS public.system_event_logs CASCADE;
DROP TABLE IF EXISTS public.email_tasks CASCADE;
DROP TABLE IF EXISTS public.campaign_jobs CASCADE;
DROP TABLE IF EXISTS public.campaign_user_allocations CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.normalized_leads CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.document_templates CASCADE;
DROP TABLE IF EXISTS public.email_senders CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

--------------------------------------
-- 3. DROP HELPER FUNCTIONS
--------------------------------------
DROP FUNCTION IF EXISTS public.trigger_set_timestamp() CASCADE;

--------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------
-- RLS policies attached to the tables above would have been dropped automatically due to `CASCADE` on `DROP TABLE`.
-- If tables were dropped without `CASCADE` (not recommended for a full cleanup), policies would need to be manually dropped:
-- Example: ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
--          DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

--------------------------------------
-- 5. STORAGE BUCKETS (Manual Deletion Required)
--------------------------------------
-- SQL cannot directly delete storage buckets. You must do this manually via the Supabase Dashboard or Management API.
-- Buckets mentioned in setup script:
--   - 'lead-uploads'
--   - 'media'

--------------------------------------
-- 6. EXTENSIONS (Conditional Drop)
--------------------------------------
-- The "uuid-ossp" extension was enabled. Only drop it if no other parts of your database depend on it.
-- Dropping an extension that is in use by other schemas/tables can break your database.
-- To drop (use with caution):
--   DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;

--------------------------------------
-- FINALIZATION
--------------------------------------
