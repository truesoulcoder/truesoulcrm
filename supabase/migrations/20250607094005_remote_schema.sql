SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- First create the postgis extension if it doesn't exist
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create the tiger schema if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'tiger') THEN
        CREATE SCHEMA tiger;
        -- Grant necessary permissions
        GRANT USAGE ON SCHEMA tiger TO postgres;
        GRANT ALL ON ALL TABLES IN SCHEMA tiger TO postgres;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA tiger TO postgres;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tiger TO postgres;
    END IF;
END
$$;

-- Create other required extensions
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

-- Now create the fuzzystrmatch extension in the tiger schema
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch" WITH SCHEMA "tiger";

-- Create other PostGIS related extensions
CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder WITH SCHEMA tiger;
CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA tiger;

-- Rest of your existing remote schema migration...
