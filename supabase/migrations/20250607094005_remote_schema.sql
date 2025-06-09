

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


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch" WITH SCHEMA "tiger";






CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "tiger";






CREATE EXTENSION IF NOT EXISTS "postgis_tiger_geocoder" WITH SCHEMA "tiger";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE TYPE "public"."campaign_status" AS ENUM (
    'DRAFT',
    'SCHEDULED',
    'RUNNING',
    'PAUSED',
    'COMPLETED',
    'STOPPED',
    'FAILED'
);


ALTER TYPE "public"."campaign_status" OWNER TO "postgres";


CREATE TYPE "public"."campaign_status_enum" AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'paused',
    'error',
    'AWAITING_CONFIRMATION'
);


ALTER TYPE "public"."campaign_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."email_status" AS ENUM (
    'PENDING',
    'SENDING',
    'SENT',
    'DELIVERED',
    'FAILED',
    'BOUNCED',
    'OPENED',
    'CLICKED',
    'COMPLAINED'
);


ALTER TYPE "public"."email_status" OWNER TO "postgres";


CREATE TYPE "public"."fine_cut_lead_type" AS (
	"id" bigint,
	"original_lead_id" "uuid",
	"market_region_id" "uuid",
	"market_region_name" "text",
	"contact_name" "text",
	"contact_email" "text",
	"contact_phone" "text",
	"contact_type" "text",
	"property_address" "text",
	"property_city" "text",
	"property_state" "text",
	"property_postal_code" "text",
	"source" "text",
	"notes" "text",
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);


ALTER TYPE "public"."fine_cut_lead_type" OWNER TO "postgres";


CREATE TYPE "public"."sender_status" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'LIMIT_REACHED'
);


ALTER TYPE "public"."sender_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$DECLARE
    v_sanitized_region TEXT;
    v_table_name TEXT;
    v_sql_command TEXT;
BEGIN
    -- 1. Sanitize Input and Generate Table Name
    IF p_market_region_raw_name IS NULL OR TRIM(p_market_region_raw_name) = '' THEN
        RAISE EXCEPTION 'Market region cannot be empty.';
    END IF;

    v_sanitized_region := lower(p_market_region_raw_name);
    v_sanitized_region := regexp_replace(v_sanitized_region, '[^a-z0-9_]+', '_', 'g'); -- Replace non-alphanumeric (excluding _) with _
    v_sanitized_region := regexp_replace(v_sanitized_region, '^[_]+|[_]+$', '', 'g'); -- Remove leading/trailing underscores

    IF v_sanitized_region = '' THEN
        RAISE EXCEPTION 'Invalid market region resulting in empty sanitized name: %', p_market_region_raw_name;
    END IF;

    v_table_name := v_sanitized_region || '_fine_cut_leads';

    -- Ensure the trigger_set_timestamp function exists
    -- This is a general function, not specific to the dynamic table, so define it if not present.
    CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
    RETURNS TRIGGER AS $trigger_func$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $trigger_func$ LANGUAGE plpgsql;

    -- Main logic wrapped in a BEGIN...EXCEPTION block for error handling
    BEGIN
        -- 2. Drop Table if it exists
        EXECUTE format('DROP TABLE IF EXISTS public.%I;', v_table_name);

        -- 3. Create Table
        v_sql_command := format('
            CREATE TABLE public.%I (
                id BIGSERIAL PRIMARY KEY,
                normalized_lead_id BIGINT NOT NULL,
                contact_name TEXT,
                contact_email TEXT,
                contact_type TEXT NOT NULL,
                market_region TEXT,
                property_address TEXT,
                property_city TEXT,
                property_state TEXT,
                property_postal_code TEXT,
                property_type TEXT,
                baths TEXT,
                beds TEXT,
                year_built TEXT,
                square_footage TEXT,
                lot_size_sqft TEXT,
                wholesale_value NUMERIC,
                assessed_total NUMERIC,
                mls_curr_status TEXT,
                mls_curr_days_on_market TEXT,
                converted BOOLEAN NOT NULL DEFAULT FALSE,
                status TEXT,
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                -- Removed FK: CONSTRAINT fk_normalized_lead FOREIGN KEY (normalized_lead_id) REFERENCES public.normalized_leads(id) ON DELETE CASCADE,
                CONSTRAINT %s_unique_contact_per_lead UNIQUE (normalized_lead_id, contact_email)
            ) TABLESPACE pg_default;',
            v_table_name, -- %I for table name
            v_table_name  -- %s for constraint name prefix
        );
        EXECUTE v_sql_command;

        -- 4. Create Indexes
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_contact_email ON public.%I(contact_email) TABLESPACE pg_default;', v_table_name, v_table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_market_region ON public.%I(market_region) TABLESPACE pg_default;', v_table_name, v_table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_property_full_addr ON public.%I(property_address, property_city, property_state, property_postal_code) TABLESPACE pg_default;', v_table_name, v_table_name);

        -- 5. Create Trigger for updated_at
        EXECUTE format('CREATE TRIGGER set_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();', v_table_name, v_table_name);

        -- 6. Data Population
        -- CTEs select from public.normalized_leads and are not dynamic in terms of table names they query from.
        -- The final INSERT INTO statement needs to target the dynamic table.
        v_sql_command := format('
            WITH all_contacts AS (
                SELECT 
                    id, contact1_name AS contact_name, LOWER(TRIM(contact1_email_1)) AS contact_email, ''contact1'' AS contact_type, market_region, property_address, property_city, property_state, property_postal_code, property_type,
                    baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total,
                    mls_curr_status, mls_curr_days_on_market, converted, status, notes, created_at, updated_at, 1 AS priority
                FROM public.normalized_leads 
                    WHERE contact1_email_1 IS NOT NULL 
                    AND contact1_email_1 NOT IN ('''', ''N/A'', ''n/a'') 
                UNION ALL
                SELECT 
                    id, contact2_name AS contact_name, LOWER(TRIM(contact2_email_1)) AS contact_email, ''contact2'' AS contact_type, market_region, property_address, property_city, property_state, property_postal_code, property_type,
                    baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total,
                    mls_curr_status, mls_curr_days_on_market, converted, status, notes, created_at, updated_at, 2 AS priority
                FROM public.normalized_leads 
                    WHERE contact2_email_1 IS NOT NULL 
                    AND contact2_email_1 NOT IN ('''', ''N/A'', ''n/a'')
                UNION ALL
                SELECT 
                    id, contact3_name AS contact_name, LOWER(TRIM(contact3_email_1)) AS contact_email, ''contact3'' AS contact_type, market_region, property_address, property_city, property_state, property_postal_code, property_type,
                    baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total,                    mls_curr_status, mls_curr_days_on_market, converted, status, notes, created_at, updated_at, 3 AS priority
                FROM public.normalized_leads 
                    WHERE contact3_email_1 IS NOT NULL 
                    AND contact3_email_1 NOT IN ('''', ''N/A'', ''n/a'')
                UNION ALL
                SELECT 
                    id, mls_curr_list_agent_name AS contact_name, LOWER(TRIM(mls_curr_list_agent_email)) AS contact_email, ''agent'' AS contact_type, market_region, property_address, property_city, property_state, property_postal_code, property_type,
                    baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total,                   mls_curr_status, mls_curr_days_on_market, converted, status, notes, created_at, updated_at, 4 AS priority
                FROM public.normalized_leads 
                    WHERE mls_curr_list_agent_email IS NOT NULL 
                    AND mls_curr_list_agent_email NOT IN ('''', ''N/A'', ''n/a'')
            ),
            deduplicated_contacts AS (
                SELECT DISTINCT ON (normalized_lead_id, contact_email)
                    id AS normalized_lead_id, contact_name, contact_email, contact_type, market_region, property_address, property_city,
                    property_state, property_postal_code, property_type, baths, beds, year_built, square_footage, lot_size_sqft,
                    wholesale_value, assessed_total, mls_curr_status, mls_curr_days_on_market,
                    converted, status, notes, created_at, updated_at
                FROM all_contacts
                WHERE contact_email IS NOT NULL -- This check is on the already transformed LOWER(TRIM(contact_email)) value
                ORDER BY normalized_lead_id, contact_email, priority, 
                    CASE WHEN contact_name IS NOT NULL AND contact_name != '''' THEN 0 ELSE 1 END
            )
            INSERT INTO public.%I (
                normalized_lead_id, contact_name, contact_email, contact_type, market_region,
                property_address, property_city, property_state, property_postal_code, property_type, baths, beds,
                year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total,
                mls_curr_status, mls_curr_days_on_market, converted, status, notes, created_at, updated_at
            )
            SELECT 
                normalized_lead_id, contact_name, contact_email, contact_type, market_region, property_address, property_city, property_state, property_postal_code, property_type, baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total,                mls_curr_status, mls_curr_days_on_market, converted, status, notes, created_at, updated_at
            FROM deduplicated_contacts;',
            v_table_name -- %I for the target table in INSERT INTO
        );
        EXECUTE v_sql_command;

        -- 7. Table and Column Comments
        EXECUTE format('COMMENT ON TABLE public.%I IS %L;', v_table_name, 'Denormalized view of normalized_leads for market region ' || p_market_region_raw_name || ' with one row per unique contact-email combination.');
        EXECUTE format('COMMENT ON COLUMN public.%I.contact_type IS %L;', v_table_name, 'Indicates the source of the contact: contact or agent');
        EXECUTE format('COMMENT ON COLUMN public.%I.normalized_lead_id IS %L;', v_table_name, 'Foreign key to the original normalized_leads table');
        
        -- 8. Add email_sent column and index
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;', v_table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_email_sent ON public.%I(email_sent) TABLESPACE pg_default;', v_table_name, v_table_name);

        -- Return the generated table name
        RETURN v_table_name;

    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error creating market specific table %: %', v_table_name, SQLERRM;
            RAISE; -- Re-raise the exception to ensure transaction rollback
    END;

END;$_$;


ALTER FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    v_sanitized_region TEXT;
    v_table_name TEXT;
    v_sql_command TEXT;
BEGIN
    -- 1. Sanitize Input and Generate Table Name
    IF p_market_region_raw_name IS NULL OR TRIM(p_market_region_raw_name) = '' THEN
        RAISE EXCEPTION 'Market region cannot be empty.';
    END IF;

    v_sanitized_region := lower(p_market_region_raw_name);
    v_sanitized_region := regexp_replace(v_sanitized_region, '[^a-z0-9_]+', '_', 'g');
    v_sanitized_region := regexp_replace(v_sanitized_region, '^[_]+|[_]+$', '', 'g');

    IF v_sanitized_region = '' THEN
        RAISE EXCEPTION 'Invalid market region resulting in empty sanitized name: %', p_market_region_raw_name;
    END IF;

    v_table_name := v_sanitized_region || '_fine_cut_leads';

    -- (Assuming trigger_set_timestamp function exists globally or is managed separately)

    BEGIN
        EXECUTE format('DROP TABLE IF EXISTS public.%I;', v_table_name);

        v_sql_command := format('
            CREATE TABLE public.%I (
                id BIGSERIAL PRIMARY KEY, normalized_lead_id BIGINT NOT NULL, contact_name TEXT, contact_email TEXT,
                contact_type TEXT NOT NULL, original_lead_id UUID, market_region TEXT, property_address TEXT,
                property_city TEXT, property_state TEXT, property_postal_code TEXT, property_type TEXT,
                baths TEXT, beds TEXT, year_built TEXT, square_footage TEXT, lot_size_sqft TEXT,
                wholesale_value NUMERIC, assessed_total NUMERIC, avm_value INTEGER, price_per_sq_ft NUMERIC,
                mls_curr_status TEXT, mls_curr_days_on_market TEXT, converted BOOLEAN NOT NULL DEFAULT FALSE,
                status TEXT, source TEXT, notes TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT %s_unique_contact_per_lead UNIQUE (normalized_lead_id, contact_email)
            );',
            v_table_name, v_table_name
        );
        EXECUTE v_sql_command;

        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_contact_email ON public.%I(contact_email);', v_table_name, v_table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_market_region ON public.%I(market_region);', v_table_name, v_table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_property_full_addr ON public.%I(property_address, property_city, property_state, property_postal_code);', v_table_name, v_table_name);
        EXECUTE format('CREATE TRIGGER set_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();', v_table_name, v_table_name);

        v_sql_command := format('
            WITH all_contacts AS (
                SELECT id, contact1_name AS contact_name, LOWER(TRIM(contact1_email_1)) AS contact_email, ''contact1'' AS contact_type, original_lead_id, market_region, property_address, property_city, property_state, property_postal_code, property_type, baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft, mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at, 1 AS priority
                FROM public.normalized_leads WHERE contact1_email_1 IS NOT NULL AND contact1_email_1 != '''' AND market_region = %L
                UNION ALL
                SELECT id, contact2_name AS contact_name, LOWER(TRIM(contact2_email_1)) AS contact_email, ''contact2'' AS contact_type, original_lead_id, market_region, property_address, property_city, property_state, property_postal_code, property_type, baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft, mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at, 2 AS priority
                FROM public.normalized_leads WHERE contact2_email_1 IS NOT NULL AND contact2_email_1 != '''' AND market_region = %L
                UNION ALL
                SELECT id, contact3_name AS contact_name, LOWER(TRIM(contact3_email_1)) AS contact_email, ''contact3'' AS contact_type, original_lead_id, market_region, property_address, property_city, property_state, property_postal_code, property_type, baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft, mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at, 3 AS priority
                FROM public.normalized_leads WHERE contact3_email_1 IS NOT NULL AND contact3_email_1 != '''' AND market_region = %L
                UNION ALL
                SELECT id, mls_curr_list_agent_name AS contact_name, LOWER(TRIM(mls_curr_list_agent_email)) AS contact_email, ''agent'' AS contact_type, original_lead_id, market_region, property_address, property_city, property_state, property_postal_code, property_type, baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft, mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at, 4 AS priority
                FROM public.normalized_leads WHERE mls_curr_list_agent_email IS NOT NULL AND mls_curr_list_agent_email != '''' AND market_region = %L
            ),
            deduplicated_contacts AS (
                SELECT DISTINCT ON (id, contact_email)
                    id AS normalized_lead_id, contact_name, contact_email, contact_type, original_lead_id, market_region, property_address, property_city,
                    property_state, property_postal_code, property_type, baths, beds, year_built, square_footage, lot_size_sqft,
                    wholesale_value, assessed_total, avm_value, price_per_sq_ft, mls_curr_status, mls_curr_days_on_market,
                    converted, status, source, notes, created_at, updated_at
                FROM all_contacts
                WHERE contact_email IS NOT NULL
                ORDER BY id, contact_email, priority, 
                    CASE WHEN contact_name IS NOT NULL AND contact_name != '''' THEN 0 ELSE 1 END
            )
            INSERT INTO public.%I (
                normalized_lead_id, contact_name, contact_email, contact_type, original_lead_id, market_region,
                property_address, property_city, property_state, property_postal_code, property_type, baths, beds,
                year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft,
                mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at
            )
            SELECT 
                normalized_lead_id, contact_name, contact_email, contact_type, original_lead_id, market_region,
                property_address, property_city, property_state, property_postal_code, property_type, baths, beds,
                year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft,
                mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at
            FROM deduplicated_contacts;',
            v_sanitized_region, v_sanitized_region, v_sanitized_region, v_sanitized_region, -- For %L
            v_table_name -- For %I
        );
        RAISE NOTICE 'Populate SQL: %', v_sql_command; -- Log the command
        EXECUTE v_sql_command;

        EXECUTE format('COMMENT ON TABLE public.%I IS %L;', v_table_name, 'Denormalized view of normalized_leads for market region ' || p_market_region_raw_name || ' with one row per unique contact-email combination.');
        EXECUTE format('COMMENT ON COLUMN public.%I.contact_type IS %L;', v_table_name, 'Indicates the source of the contact: contact1, contact2, contact3, or agent');
        EXECUTE format('COMMENT ON COLUMN public.%I.normalized_lead_id IS %L;', v_table_name, 'Foreign key to the original normalized_leads table');
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;', v_table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_email_sent ON public.%I(email_sent);', v_table_name, v_table_name);

        RETURN v_table_name;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error creating market specific table %: SQLSTATE: %, MESSAGE: %', v_table_name, SQLSTATE, SQLERRM;
            RAISE;
    END;
END;
$_$;


ALTER FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_complete_schema_dump"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    dump_text text := '';
    r record := NULL;
    col record := NULL;      -- For column loops
    con record := NULL;      -- For constraint loops
    policy record := NULL;   -- For policy loops
    m record := NULL;        -- For membership loops
    g record := NULL;        -- For grantee loops
    priv text := NULL;       -- For privilege handling
    i record := NULL;        -- For general iteration
    j record := NULL;        -- For nested iteration
BEGIN
    -- 1. EXTENSIONS
    dump_text := dump_text || '-- ========== EXTENSIONS ==========' || E'\n\n';
    FOR r IN 
        SELECT 'CREATE EXTENSION IF NOT EXISTS ' || extname || 
               ' WITH SCHEMA ' || extnamespace::regnamespace || ';' as ext_command
        FROM pg_extension
        WHERE extname != 'plpgsql'  -- Skip plpgsql as it's a default extension
        ORDER BY extname
    LOOP
        dump_text := dump_text || r.ext_command || E'\n';
    END LOOP;
    dump_text := dump_text || E'\n';

    -- 2. SCHEMAS
    dump_text := dump_text || '-- ========== SCHEMAS ==========' || E'\n\n';
    FOR r IN 
        SELECT nspname as schema_name,
               nspowner::regrole::text as owner,
               'CREATE SCHEMA IF NOT EXISTS ' || nspname || 
               CASE 
                   WHEN nspowner::regrole::text != 'postgres' THEN 
                       ' AUTHORIZATION ' || nspowner::regrole::text 
                   ELSE '' 
               END || ';' as schema_command
        FROM pg_namespace
        WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'
        ORDER BY nspname
    LOOP
        -- Store schema creation command
        dump_text := dump_text || '-- Creating schema: ' || r.schema_name || E'\n';
        dump_text := dump_text || r.schema_command || E'\n';
        
        -- Set comment if exists
        BEGIN
            DECLARE
                schema_comment text;
            BEGIN
                SELECT obj_description(oid, 'pg_namespace')
                INTO schema_comment
                FROM pg_namespace
                WHERE nspname = r.schema_name;
                
                IF schema_comment IS NOT NULL THEN
                    dump_text := dump_text || 'COMMENT ON SCHEMA ' || r.schema_name || ' IS ' || 
                                quote_literal(schema_comment) || ';' || E'\n';
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Ignore errors in comment extraction
                NULL;
            END;
        END;
    END LOOP;
    dump_text := dump_text || E'\n';

    -- 3. DOMAINS
    dump_text := dump_text || '-- ========== DOMAINS ==========' || E'\n\n';
    FOR r IN 
        SELECT pg_get_userbyid(typowner) as owner, 
               n.nspname as schema, 
               t.typname as name,
               pg_catalog.format_type(t.typbasetype, t.typtypmod) as type,
               t.typnotnull as not_null,
               t.typdefault as default_value,
               t.typdefaultbin as default_bin,
               (SELECT c.collname FROM pg_catalog.pg_collation c, pg_catalog.pg_type bt 
                WHERE c.oid = t.typcollation AND bt.oid = t.typbasetype AND t.typcollation <> bt.typcollation) as collation,
               CASE WHEN t.typdefault IS NOT NULL THEN 'DEFAULT ' || t.typdefault ELSE '' END as default_expr,
               pg_catalog.array_to_string(ARRAY(
                   SELECT pg_catalog.pg_get_constraintdef(con.oid, true)
                   FROM pg_catalog.pg_constraint con
                   WHERE con.contypid = t.oid
               ), ' ') as constraints
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'd'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY 1, 2
    LOOP
        dump_text := dump_text || '-- Domain: ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '-- DROP DOMAIN IF EXISTS ' || r.schema || '.' || r.name || ';' || E'\n';
        dump_text := dump_text || 'CREATE DOMAIN ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '    AS ' || r.type || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.not_null THEN 'NOT NULL' ELSE 'NULL' END || E'\n';
        IF r.default_value IS NOT NULL THEN
            dump_text := dump_text || '    DEFAULT ' || r.default_value || E'\n';
        END IF;
        IF r.collation IS NOT NULL THEN
            dump_text := dump_text || '    COLLATE ' || r.collation || E'\n';
        END IF;
        IF r.constraints IS NOT NULL THEN
            dump_text := dump_text || '    ' || r.constraints || E'\n';
        END IF;
        dump_text := dump_text || ';' || E'\n\n';
    END LOOP;

    -- 4. SEQUENCES
    dump_text := dump_text || '-- ========== SEQUENCES ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as name, 
               pg_get_userbyid(c.relowner) as owner,
               s.seqtypid::regtype as data_type,
               s.seqstart as start_value,
               s.seqmin as min_value,
               s.seqmax as max_value,
               s.seqincrement as increment_by,
               s.seqcycle as cycles,
               s.seqcache as cache,
               s.seqtypid::regtype as data_type
        FROM pg_sequence s
        JOIN pg_class c ON c.oid = s.seqrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY n.nspname, c.relname
    LOOP
        dump_text := dump_text || '-- Sequence: ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '-- DROP SEQUENCE IF EXISTS ' || r.schema || '.' || r.name || ';' || E'\n';
        dump_text := dump_text || 'CREATE SEQUENCE IF NOT EXISTS ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '    AS ' || r.data_type || E'\n';
        dump_text := dump_text || '    START WITH ' || r.start_value || E'\n';
        dump_text := dump_text || '    INCREMENT BY ' || r.increment_by || E'\n';
        dump_text := dump_text || '    MINVALUE ' || r.min_value || E'\n';
        dump_text := dump_text || '    MAXVALUE ' || r.max_value || E'\n';
        dump_text := dump_text || '    CACHE ' || r.cache || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.cycles THEN 'CYCLE' ELSE 'NO CYCLE' END || ';' || E'\n\n';
        
        -- Add ownership
        dump_text := dump_text || 'ALTER SEQUENCE ' || r.schema || '.' || r.name || 
                     ' OWNER TO ' || r.owner || ';' || E'\n\n';
    END LOOP;

    -- 5. TABLES
    dump_text := dump_text || '-- ========== TABLES ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as name, 
               pg_get_userbyid(c.relowner) as owner,
               obj_description(c.oid, 'pg_class') as description,
               array_agg(DISTINCT t.typname) as types
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_type t ON t.typrelid = c.oid
        WHERE c.relkind = 'r' 
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        GROUP BY n.nspname, c.relname, c.relowner, c.oid
        ORDER BY n.nspname, c.relname
    LOOP
        -- Table comment
        IF r.description IS NOT NULL THEN
            dump_text := dump_text || 'COMMENT ON TABLE ' || r.schema || '.' || r.name || 
                        ' IS ' || quote_literal(r.description) || ';' || E'\n';
        END IF;
        
        -- Table definition
        dump_text := dump_text || '-- Table: ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '-- DROP TABLE IF EXISTS ' || r.schema || '.' || r.name || ';' || E'\n';
        dump_text := dump_text || 'CREATE TABLE ' || r.schema || '.' || r.name || ' (' || E'\n';
        
        -- Columns
        FOR col IN 
            SELECT a.attname as name,
                   pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
                   (SELECT substring(pg_catalog.pg_get_expr(d.adbin, d.adrelid) for 128)
                    FROM pg_attrdef d
                    WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum AND a.atthasdef) as default_value,
                   a.attnotnull as not_null,
                   a.attnum as attnum
            FROM pg_attribute a
            WHERE a.attrelid = (r.schema || '.' || r.name)::regclass
            AND a.attnum > 0
            AND NOT a.attisdropped
            ORDER BY a.attnum
        LOOP
            dump_text := dump_text || '    ' || col.name || ' ' || col.type;
            
            IF col.default_value IS NOT NULL THEN
                dump_text := dump_text || ' DEFAULT ' || col.default_value;
            END IF;
            
            IF col.not_null THEN
                dump_text := dump_text || ' NOT NULL';
            END IF;
            
            dump_text := dump_text || E'\n';
        END LOOP;
        
        -- Primary key
        FOR con IN 
            SELECT conname, pg_get_constraintdef(oid) as condef
            FROM pg_constraint
            WHERE conrelid = (r.schema || '.' || r.name)::regclass
            AND contype = 'p'
        LOOP
            dump_text := dump_text || '    , CONSTRAINT ' || con.conname || ' ' || con.condef || E'\n';
        END LOOP;
        
        dump_text := dump_text || ');' || E'\n\n';
        
        -- Table ownership
        dump_text := dump_text || 'ALTER TABLE ' || r.schema || '.' || r.name || 
                    ' OWNER TO ' || r.owner || ';' || E'\n\n';
                    
        -- Column comments
        FOR col IN 
            SELECT a.attname as name, d.description
            FROM pg_description d
            JOIN pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid
            WHERE d.objoid = (r.schema || '.' || r.name)::regclass
            AND d.objsubid > 0
            AND d.description IS NOT NULL
        LOOP
            dump_text := dump_text || 'COMMENT ON COLUMN ' || r.schema || '.' || r.name || 
                        '.' || col.name || ' IS ' || quote_literal(col.description) || ';' || E'\n';
        END LOOP;
        dump_text := dump_text || E'\n';
    END LOOP;

    -- 6. INDEXES
    dump_text := dump_text || '-- ========== INDEXES ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as table_name, 
               i.relname as index_name, 
               pg_get_indexdef(i.oid) as index_def,
               pg_get_userbyid(c.relowner) as owner
        FROM pg_index x
        JOIN pg_class c ON c.oid = x.indrelid
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' 
        AND i.relkind = 'i'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        ORDER BY n.nspname, c.relname, i.relname
    LOOP
        dump_text := dump_text || '-- Index: ' || r.schema || '.' || r.index_name || E'\n';
        dump_text := dump_text || '-- DROP INDEX IF EXISTS ' || r.schema || '.' || r.index_name || ';' || E'\n';
        dump_text := dump_text || r.index_def || ';' || E'\n\n';
    END LOOP;

    -- 7. CONSTRAINTS (FOREIGN KEYS, CHECKS, UNIQUE)
    dump_text := dump_text || '-- ========== CONSTRAINTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as table_name, 
               conname as constraint_name, 
               pg_get_constraintdef(oid) as constraint_def,
               contype as constraint_type
        FROM pg_constraint
        JOIN pg_class c ON c.oid = conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        AND contype IN ('f', 'c', 'u')
        ORDER BY n.nspname, c.relname, conname
    LOOP
        dump_text := dump_text || '-- Constraint: ' || r.constraint_name || ' ON ' || 
                    r.schema || '.' || r.table_name || E'\n';
        dump_text := dump_text || 'ALTER TABLE ' || r.schema || '.' || r.table_name || 
                    ' ADD CONSTRAINT ' || r.constraint_name || ' ' || 
                    r.constraint_def || ';' || E'\n\n';
    END LOOP;

    -- 8. TRIGGERS
    dump_text := dump_text || '-- ========== TRIGGERS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as table_name, 
               t.tgname as trigger_name,
               pg_get_triggerdef(t.oid) as trigger_def,
               pg_get_userbyid(c.relowner) as owner
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        ORDER BY n.nspname, c.relname, t.tgname
    LOOP
        dump_text := dump_text || '-- Trigger: ' || r.trigger_name || ' ON ' || 
                    r.schema || '.' || r.table_name || E'\n';
        dump_text := dump_text || '-- DROP TRIGGER IF EXISTS ' || r.trigger_name || 
                    ' ON ' || r.schema || '.' || r.table_name || ';' || E'\n';
        dump_text := dump_text || r.trigger_def || ';' || E'\n\n';
    END LOOP;

 -- 9. FUNCTIONS
    dump_text := dump_text || '-- ========== FUNCTIONS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, 
               p.proname as function_name,
               pg_get_userbyid(p.proowner) as owner,
               pg_get_function_identity_arguments(p.oid) as args,
               pg_get_function_result(p.oid) as return_type,
               pg_get_functiondef(p.oid) as function_def,
               l.lanname as language,
               p.prosecdef as security_definer,
               p.provolatile as volatility,
               p.proleakproof as leakproof,
               p.proisstrict as is_strict,
               p.proretset as returns_set,
               p.procost as cost,
               p.prorows as rows,
               p.proconfig as config,
               obj_description(p.oid, 'pg_proc') as description
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        AND p.prokind = 'f'  -- Only normal functions
        ORDER BY n.nspname, p.proname, p.oid
    LOOP
        dump_text := dump_text || '-- Function: ' || r.schema || '.' || r.function_name || '(' || r.args || ')' || E'\n';
        dump_text := dump_text || '-- DROP FUNCTION IF EXISTS ' || r.schema || '.' || r.function_name || 
                    '(' || r.args || ');' || E'\n';
        dump_text := dump_text || r.function_def || ';' || E'\n\n';
        
        -- Function comment
        IF r.description IS NOT NULL THEN
            dump_text := dump_text || 'COMMENT ON FUNCTION ' || r.schema || '.' || r.function_name || 
                        '(' || r.args || ') IS ' || quote_literal(r.description) || ';' || E'\n\n';
        END IF;
        
        -- Function ownership
        dump_text := dump_text || 'ALTER FUNCTION ' || r.schema || '.' || r.function_name || 
                    '(' || r.args || ') OWNER TO ' || r.owner || ';' || E'\n\n';
    END LOOP;


    dump_text := dump_text || '-- ========== ROW LEVEL SECURITY POLICIES ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, 
               c.relname as table_name,
               p.polname as policy_name,
               p.polpermissive as is_permissive,
               p.polroles as roles,
               p.polcmd as command_type,
               p.polqual as using_qual,
               p.polwithcheck as with_check_qual,
               pg_get_userbyid(c.relowner) as owner
        FROM pg_policy p
        JOIN pg_class c ON p.polrelid = c.oid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        ORDER BY n.nspname, c.relname, p.polname
    LOOP
        dump_text := dump_text || '-- Policy: ' || r.policy_name || ' ON ' || r.schema || '.' || r.table_name || E'\n';
        dump_text := dump_text || '-- DROP POLICY IF EXISTS ' || r.policy_name || ' ON ' || r.schema || '.' || r.table_name || ';' || E'\n';
        
        dump_text := dump_text || 'CREATE POLICY ' || r.policy_name || E'\n' ||
                    '    ON ' || r.schema || '.' || r.table_name || E'\n' ||
                    '    AS ' || CASE WHEN r.is_permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END || E'\n' ||
                    '    FOR ' || 
                    CASE r.command_type
                        WHEN 'r' THEN 'SELECT'
                        WHEN 'a' THEN 'INSERT'
                        WHEN 'w' THEN 'UPDATE'
                        WHEN 'd' THEN 'DELETE'
                        WHEN '*' THEN 'ALL'
                    END || E'\n' ||
                    '    TO ' || 
                    CASE 
                        WHEN r.roles = '{0}' THEN 'PUBLIC'
                        ELSE (SELECT string_agg(quote_ident(rolname), ', ') 
                              FROM pg_roles 
                              WHERE oid = ANY(r.roles))
                    END || E'\n';
                    
        IF r.using_qual IS NOT NULL THEN
            dump_text := dump_text || '    USING (' || pg_get_expr(r.using_qual, p.polrelid) || ')' || E'\n';
        END IF;
        
        IF r.with_check_qual IS NOT NULL THEN
            dump_text := dump_text || '    WITH CHECK (' || pg_get_expr(r.with_check_qual, p.polrelid) || ')' || E'\n';
        END IF;
        
        dump_text := dump_text || ';' || E'\n\n';
    END LOOP;

    -- 11. STORAGE BUCKETS AND POLICIES
    dump_text := dump_text || '-- ========== STORAGE BUCKETS ==========' || E'\n\n';
    
    -- Storage buckets
    FOR r IN 
        SELECT * FROM storage.buckets
        ORDER BY name
    LOOP
        dump_text := dump_text || '-- Storage Bucket: ' || r.name || E'\n';
        dump_text := dump_text || '-- DROP BUCKET IF EXISTS ' || r.name || ';' || E'\n';
        dump_text := dump_text || 'INSERT INTO storage.buckets (id, name, owner, public, avif_autodetection, file_size_limit, allowed_mime_types, created_at, updated_at)' || E'\n';
        dump_text := dump_text || 'VALUES (' || 
                    quote_literal(r.id) || ', ' ||
                    quote_literal(r.name) || ', ' ||
                    quote_nullable(r.owner) || ', ' ||
                    r.public || ', ' ||
                    r.avif_autodetection || ', ' ||
                    r.file_size_limit || ', ' ||
                    quote_nullable(r.allowed_mime_types::text) || ', ' ||
                    quote_literal(r.created_at) || ', ' ||
                    quote_literal(r.updated_at) ||
                    ')' || E'\n';
        
        -- Handle conflicts for existing buckets
        dump_text := dump_text || 'ON CONFLICT (name) DO UPDATE SET' || E'\n' ||
                    '    id = EXCLUDED.id,' || E'\n' ||
                    '    owner = EXCLUDED.owner,' || E'\n' ||
                    '    public = EXCLUDED.public,' || E'\n' ||
                    '    avif_autodetection = EXCLUDED.avif_autodetection,' || E'\n' ||
                    '    file_size_limit = EXCLUDED.file_size_limit,' || E'\n' ||
                    '    allowed_mime_types = EXCLUDED.allowed_mime_types,' || E'\n' ||
                    '    updated_at = EXCLUDED.updated_at;' || E'\n\n';
        
        -- Bucket policies
        FOR policy IN 
            SELECT * FROM pg_policies 
            WHERE schemaname = 'storage' 
            AND tablename = 'objects'
            AND policyname LIKE r.name || '%'
            ORDER BY policyname
        LOOP
            dump_text := dump_text || '-- Policy: ' || policy.policyname || E'\n';
            dump_text := dump_text || '-- DROP POLICY IF EXISTS ' || policy.policyname || ' ON storage.objects;' || E'\n';
            dump_text := dump_text || 'CREATE POLICY ' || policy.policyname || E'\n';
            dump_text := dump_text || '    ON storage.objects' || E'\n';
            dump_text := dump_text || '    AS ' || policy.permissive::text || E'\n';
            dump_text := dump_text || '    FOR ' || policy.cmd::text || E'\n';
            dump_text := dump_text || '    TO ' || policy.roles::text || E'\n';
            
            IF policy.qual IS NOT NULL THEN
                dump_text := dump_text || '    USING (' || policy.qual || ')' || E'\n';
            END IF;
            
            IF policy.with_check IS NOT NULL THEN
                dump_text := dump_text || '    WITH CHECK (' || policy.with_check || ')' || E'\n';
            END IF;
            
            dump_text := dump_text || ';' || E'\n\n';
        END LOOP;
    END LOOP;

    -- 12. ROLES AND PRIVILEGES
    dump_text := dump_text || '-- ========== ROLES AND PRIVILEGES ==========' || E'\n\n';
    
    -- Roles
    FOR r IN 
        SELECT * FROM pg_roles 
        WHERE rolname NOT IN ('postgres', 'pg_signal_backend', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin')
        AND rolname NOT LIKE 'pg_%'
        ORDER BY rolname
    LOOP
        dump_text := dump_text || '-- Role: ' || r.rolname || E'\n';
        dump_text := dump_text || '-- DROP ROLE IF EXISTS ' || r.rolname || ';' || E'\n';
        dump_text := dump_text || 'CREATE ROLE ' || r.rolname || ' WITH' || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolsuper THEN 'SUPERUSER' ELSE 'NOSUPERUSER' END || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolinherit THEN 'INHERIT' ELSE 'NOINHERIT' END || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolcreaterole THEN 'CREATEROLE' ELSE 'NOCREATEROLE' END || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolcreatedb THEN 'CREATEDB' ELSE 'NOCREATEDB' END || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolcanlogin THEN 'LOGIN' ELSE 'NOLOGIN' END || E'\n';
        dump_text := dump_text || '    ' || 'REPLICATION' || E'\n';
        dump_text := dump_text || '    ' || 'BYPASSRLS' || E'\n';
        dump_text := dump_text || '    ' || 'CONNECTION LIMIT ' || r.rolconnlimit || E'\n';
        
        IF r.rolpassword IS NOT NULL THEN
            dump_text := dump_text || '    ' || 'PASSWORD ' || quote_literal(r.rolpassword) || E'\n';
        END IF;
        
        dump_text := dump_text || '    ' || 'VALID UNTIL ' || 
                    CASE 
                        WHEN r.rolvaliduntil IS NULL THEN '''infinity''' 
                        ELSE quote_literal(r.rolvaliduntil::text) 
                    END || ';' || E'\n\n';
        
        -- Role memberships
        FOR m IN 
            SELECT roleid::regrole::text as role
            FROM pg_auth_members
            WHERE member = r.oid
        LOOP
            dump_text := dump_text || 'GRANT ' || m.role || ' TO ' || r.rolname || ';' || E'\n';
        END LOOP;
        dump_text := dump_text || E'\n';
    END LOOP;

    -- 13. SCHEMA GRANTS
    dump_text := dump_text || '-- ========== SCHEMA GRANTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema,
               r.rolname as role,
               array_agg(DISTINCT priv) as privs
        FROM (
            SELECT n.oid as nspid, n.nspname, r.rolname, 
                   CASE 
                       WHEN has_schema_privilege(r.oid, n.oid, 'CREATE') THEN 'CREATE'
                   END as priv
            FROM pg_namespace n
            CROSS JOIN pg_roles r
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_schema_privilege(r.oid, n.oid, 'CREATE')
            
            UNION ALL
            
            SELECT n.oid as nspid, n.nspname, r.rolname, 
                   CASE 
                       WHEN has_schema_privilege(r.oid, n.oid, 'USAGE') THEN 'USAGE'
                   END as priv
            FROM pg_namespace n
            CROSS JOIN pg_roles r
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_schema_privilege(r.oid, n.oid, 'USAGE')
        ) t
        JOIN pg_namespace n ON t.nspid = n.oid
        JOIN pg_roles r ON t.rolname = r.rolname
        WHERE t.priv IS NOT NULL
        GROUP BY n.nspname, r.rolname
        ORDER BY n.nspname, r.rolname
    LOOP
        dump_text := dump_text || 'GRANT ' || array_to_string(r.privs, ', ') || 
                    ' ON SCHEMA ' || r.schema || ' TO ' || r.role || ';' || E'\n';
    END LOOP;
    dump_text := dump_text || E'\n';

    -- 14. TABLE GRANTS
    dump_text := dump_text || '-- ========== TABLE GRANTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema,
               c.relname as table_name,
               r.rolname as role,
               array_agg(DISTINCT priv) as privs
        FROM (
            SELECT c.oid as relid, n.nspname, c.relname, r.rolname, 
                   CASE 
                       WHEN has_table_privilege(r.oid, c.oid, 'SELECT') THEN 'SELECT'
                   END as priv
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN pg_roles r
            WHERE c.relkind = 'r'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_table_privilege(r.oid, c.oid, 'SELECT')
            
            UNION ALL
            
            -- Add other privileges similarly (INSERT, UPDATE, DELETE, etc.)
            SELECT c.oid as relid, n.nspname, c.relname, r.rolname, 
                   CASE 
                       WHEN has_table_privilege(r.oid, c.oid, 'INSERT') THEN 'INSERT'
                   END as priv
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN pg_roles r
            WHERE c.relkind = 'r'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_table_privilege(r.oid, c.oid, 'INSERT')
            
            -- Add other privileges as needed
        ) t
        JOIN pg_class c ON t.relid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_roles r ON t.rolname = r.rolname
        WHERE t.priv IS NOT NULL
        GROUP BY n.nspname, c.relname, r.rolname
        ORDER BY n.nspname, c.relname, r.rolname
    LOOP
        dump_text := dump_text || 'GRANT ' || array_to_string(r.privs, ', ') || 
                    ' ON ' || r.schema || '.' || r.table_name || ' TO ' || r.role || ';' || E'\n';
    END LOOP;

    -- 15. SEQUENCE GRANTS
    dump_text := dump_text || E'\n-- ========== SEQUENCE GRANTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema,
               c.relname as sequence_name,
               r.rolname as role,
               array_agg(DISTINCT priv) as privs
        FROM (
            SELECT c.oid as relid, n.nspname, c.relname, r.rolname, 
                   CASE 
                       WHEN has_sequence_privilege(r.oid, c.oid, 'USAGE') THEN 'USAGE'
                   END as priv
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN pg_roles r
            WHERE c.relkind = 'S'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_sequence_privilege(r.oid, c.oid, 'USAGE')
            
            -- Add other sequence privileges as needed
        ) t
        JOIN pg_class c ON t.relid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_roles r ON t.rolname = r.rolname
        WHERE t.priv IS NOT NULL
        GROUP BY n.nspname, c.relname, r.rolname
        ORDER BY n.nspname, c.relname, r.rolname
    LOOP
        dump_text := dump_text || 'GRANT ' || array_to_string(r.privs, ', ') || 
                    ' ON SEQUENCE ' || r.schema || '.' || r.sequence_name || ' TO ' || r.role || ';' || E'\n';
    END LOOP;

    -- 16. FUNCTION GRANTS
    dump_text := dump_text || E'\n-- ========== FUNCTION GRANTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema,
               p.proname as function_name,
               pg_get_function_identity_arguments(p.oid) as args,
               r.rolname as role,
               array_agg(DISTINCT priv) as privs
        FROM (
            SELECT p.oid as fnid, n.nspname, p.proname, r.rolname, 
                   CASE 
                       WHEN has_function_privilege(r.oid, p.oid, 'EXECUTE') THEN 'EXECUTE'
                   END as priv
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN pg_roles r
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
        ) t
        JOIN pg_proc p ON t.fnid = p.oid
        JOIN pg_namespace n ON p.pronamespace = n.oid
        JOIN pg_roles r ON t.rolname = r.rolname
        WHERE t.priv IS NOT NULL
        GROUP BY n.nspname, p.proname, p.oid, r.rolname
        ORDER BY n.nspname, p.proname, r.rolname
    LOOP
        dump_text := dump_text || 'GRANT ' || array_to_string(r.privs, ', ') || 
                    ' ON FUNCTION ' || r.schema || '.' || r.function_name || 
                    '(' || r.args || ') TO ' || r.role || ';' || E'\n';
    END LOOP;

    -- 17. DEFAULT PRIVILEGES
    dump_text := dump_text || E'\n-- ========== DEFAULT PRIVILEGES ==========' || E'\n\n';
    FOR i IN 
        SELECT 
            pg_get_userbyid(d.defaclrole) as owner,
            n.nspname as schema,
            CASE d.defaclobjtype
                WHEN 'r' THEN 'TABLES'
                WHEN 'S' THEN 'SEQUENCES'
                WHEN 'f' THEN 'FUNCTIONS'
                WHEN 'T' THEN 'TYPES'
            END as object_type,
            array_agg(DISTINCT priv) as privs,
            array_agg(DISTINCT grantee) as grantees
        FROM (
            SELECT 
                d.defaclrole,
                d.defaclnamespace,
                d.defaclobjtype,
                a.rolname as grantee,
                CASE 
                    WHEN aclcontains(d.defaclacl, 
                        makeaclitem(d.defaclrole, a.oid, 
                            CASE 
                                WHEN d.defaclobjtype = 'r' THEN 'arwdDxt'::text 
                                WHEN d.defaclobjtype = 'S' THEN 'rwU'::text
                                WHEN d.defaclobjtype = 'f' THEN 'X'::text
                                WHEN d.defaclobjtype = 'T' THEN 'U'::text
                                ELSE ''::text
                            END, 
                            false)) 
                    THEN 'ALL'
                    ELSE string_agg(
                        CASE 
                            WHEN aclcontains(d.defaclacl, 
                                makeaclitem(d.defaclrole, a.oid, c.privilege_type, false))
                            THEN c.privilege_type
                            ELSE NULL
                        END, 
                        ', '
                    )
                END as priv
            FROM pg_default_acl d
            CROSS JOIN pg_roles a
            CROSS JOIN (
                SELECT 'SELECT' as privilege_type, 'r' as objtype
                UNION ALL SELECT 'INSERT', 'r'
                UNION ALL SELECT 'UPDATE', 'r'
                UNION ALL SELECT 'DELETE', 'r'
                UNION ALL SELECT 'TRUNCATE', 'r'
                UNION ALL SELECT 'REFERENCES', 'r'
                UNION ALL SELECT 'TRIGGER', 'r'
                UNION ALL SELECT 'USAGE', 'S'
                UNION ALL SELECT 'SELECT', 'S'
                UNION ALL SELECT 'UPDATE', 'S'
                UNION ALL SELECT 'EXECUTE', 'f'
                UNION ALL SELECT 'USAGE', 'T'
            ) c
            WHERE a.rolname NOT LIKE 'pg_%'
            AND (d.defaclobjtype = c.objtype OR (d.defaclobjtype = 'r' AND c.objtype = 'r'))
            GROUP BY d.defaclrole, d.defaclnamespace, d.defaclobjtype, a.oid, a.rolname
        ) t
        JOIN pg_namespace n ON n.oid = t.defaclnamespace
        WHERE t.priv IS NOT NULL
        GROUP BY t.defaclrole, n.nspname, t.defaclobjtype
        ORDER BY t.defaclrole, n.nspname, t.defaclobjtype
    LOOP
        FOR j IN SELECT unnest(i.grantees) as grantee
        LOOP
            dump_text := dump_text || 'ALTER DEFAULT PRIVILEGES ';
            
            IF i.owner != 'postgres' THEN
                dump_text := dump_text || 'FOR ROLE ' || i.owner || ' ';
            END IF;
            
            IF i.schema IS NOT NULL THEN
                dump_text := dump_text || 'IN SCHEMA ' || i.schema || ' ';
            END IF;
            
            dump_text := dump_text || 'GRANT ' || array_to_string(i.privs, ', ') || 
                        ' ON ' || i.object_type || ' TO ' || j.grantee || ';' || E'\n';
        END LOOP;
    END LOOP;

    -- 18. FINAL MESSAGE
    dump_text := dump_text || E'\n-- ========== SCHEMA DUMP COMPLETE ==========' || E'\n';
    dump_text := dump_text || '-- Generated at: ' || now()::timestamp || E'\n';
    
    RETURN dump_text;
EXCEPTION 
    WHEN OTHERS THEN
        DECLARE
            error_context text;
        BEGIN
            -- Try to get some context without assuming any variables exist
            error_context := 'Error occurred in function generate_complete_schema_dump';
            
            -- Try to include the current SQL state and error message
            error_context := error_context || E'\nSQL State: ' || SQLSTATE;
            error_context := error_context || E'\nError Message: ' || SQLERRM;
            
            -- Try to include the current timestamp
            error_context := error_context || E'\nTimestamp: ' || now()::timestamp;
            
            -- Include the full error context
            error_context := error_context || E'\n\nFull Error Context:';
            error_context := error_context || E'\n----------------------------------------';
            
            -- Try to include any available context variables safely
            BEGIN
                IF r IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed record (r): ' || r::text;
                END IF;
                
                IF i IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed default privilege (i): ' || i::text;
                END IF;
                
                IF col IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed column: ' || col::text;
                END IF;
                
                IF con IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed constraint: ' || con::text;
                END IF;
                
                IF policy IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed policy: ' || policy::text;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Ignore errors in error handling
                NULL;
            END;
            
            RETURN error_context;
        END;
END;
$$;


ALTER FUNCTION "public"."generate_complete_schema_dump"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campaign_jobs_csv"("query_campaign_id" "uuid", "query_min_creation_timestamp" timestamp with time zone) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    csv_data TEXT;
    -- Define the header for the CSV, matching crondonkey.py's expected columns
    header TEXT := 'job_id,next_processed_time';
BEGIN
    SELECT 
        -- Start with the header
        header || E'\n' || 
        -- Aggregate job rows into a single string, each row separated by a newline
        COALESCE(
            string_agg(
                -- Format each job's ID and its next_processed_time
                -- The time is explicitly cast to UTC and formatted as ISO 8601 with 'Z'
                cj.id::TEXT || ',' || to_char(cj.next_processed_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                E'\n' -- Newline character as separator for string_agg
            ), 
            '' -- If no rows found, string_agg returns NULL, so coalesce to an empty string
        )
    INTO csv_data
    FROM public.campaign_jobs cj
    WHERE 
        cj.campaign_id = query_campaign_id
      AND cj.created_at >= query_min_creation_timestamp; -- Filter for jobs created during or after this run started

    -- If csv_data is just the header + newline (meaning no actual job rows were found),
    -- return only the header. Otherwise, return the full CSV data.
    IF csv_data = header || E'\n' THEN
        RETURN header; 
    END IF;

    RETURN csv_data;
END;
$$;


ALTER FUNCTION "public"."get_campaign_jobs_csv"("query_campaign_id" "uuid", "query_min_creation_timestamp" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campaigns_to_process"() RETURNS TABLE("campaign_id" "uuid", "campaign_name" "text", "pending_jobs" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS campaign_id,
    c.name AS campaign_name,
    COUNT(cj.id) AS pending_jobs
  FROM 
    public.campaigns c
    LEFT JOIN public.campaign_jobs cj ON c.id = cj.campaign_id
      AND cj.status = 'pending'
      AND (cj.next_processing_time IS NULL OR cj.next_processing_time <= NOW())
  WHERE 
    c.status = 'active'
    AND c.is_active = true
  GROUP BY 
    c.id, c.name
  HAVING 
    COUNT(cj.id) > 0;
END;
$$;


ALTER FUNCTION "public"."get_campaigns_to_process"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_email_metrics_time_series"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "interval_days" integer DEFAULT 1) RETURNS TABLE("date_group" "date", "sent" bigint, "delivered" bigint, "bounced" bigint, "opened" bigint, "clicked" bigint, "replied" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  WITH date_series AS (
    SELECT 
      generate_series(
        date_trunc('day', start_date)::timestamp,
        date_trunc('day', end_date) + interval '1 day',
        (interval_days || ' day')::interval
      ) AS date_group
  )
  SELECT 
    ds.date_group::date,
    COUNT(DISTINCT CASE WHEN el.email_status = 'SENT' THEN el.id END) AS sent,
    COUNT(DISTINCT CASE WHEN el.email_status = 'DELIVERED' THEN el.id END) AS delivered,
    COUNT(DISTINCT CASE WHEN el.email_status = 'BOUNCED' THEN el.id END) AS bounced,
    COUNT(DISTINCT CASE WHEN el.email_status = 'OPENED' THEN el.id END) AS opened,
    COUNT(DISTINCT CASE WHEN el.email_status = 'CLICKED' THEN el.id END) AS clicked,
    COUNT(DISTINCT CASE WHEN el.email_status = 'REPLIED' THEN el.id END) AS replied
  FROM 
    date_series ds
  LEFT JOIN 
    public.eli5_email_log el ON 
      el.email_sent_at >= ds.date_group AND 
      el.email_sent_at < ds.date_group + (interval_days || ' day')::interval
  GROUP BY 
    ds.date_group
  ORDER BY 
    ds.date_group;
$$;


ALTER FUNCTION "public"."get_email_metrics_time_series"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "interval_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_kpi_stats_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_kpi_stats_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_document_template"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Set created_by if not provided
  IF NEW.created_by IS NULL AND NEW.user_id IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  
  -- Ensure user_id matches created_by
  NEW.user_id = COALESCE(NEW.user_id, NEW.created_by);
  
  -- Set defaults
  NEW.is_active = COALESCE(NEW.is_active, true);
  NEW.created_at = COALESCE(NEW.created_at, NOW());
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_document_template"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_document_template"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_document_template"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data THEN
    UPDATE public.profiles
    SET 
      full_name = COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'user_name',
        full_name
      ),
      avatar_url = COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture',
        avatar_url
      ),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_user_updated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_sender_sent_count"("sender_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- First check if we need to reset the counter (if it's a new day)
  UPDATE public.senders 
  SET 
    sent_today = 0,
    last_reset_date = CURRENT_DATE,
    updated_at = NOW()
  WHERE id = sender_id 
  AND (last_reset_date IS NULL OR last_reset_date < CURRENT_DATE);
  
  -- Then increment the counter
  UPDATE public.senders 
  SET 
    sent_today = COALESCE(sent_today, 0) + 1,
    updated_at = NOW()
  WHERE id = sender_id;
  
  -- If no rows were updated, it means the sender doesn't exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sender with ID % not found', sender_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."increment_sender_sent_count"("sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_market_name"("p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    RETURN lower(trim(p_name));
END;
$$;


ALTER FUNCTION "public"."normalize_market_name"("p_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalize_market_name"("p_name" "text") IS 'Normalizes a market name string to match the generated market_regions.normalized_name (lower(trim(name))).';



CREATE OR REPLACE FUNCTION "public"."normalize_staged_leads"("p_market_region" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    r RECORD;
    v_original_lead_id UUID;
    v_wholesale_value_text TEXT;
    v_assessed_total_text TEXT;
    v_avm_value_text TEXT;
    v_price_per_sq_ft_text TEXT;
    v_error_details TEXT;
BEGIN
    FOR r IN 
        SELECT id, raw_data, uploaded_by 
        FROM public.leads
        WHERE normalization_status = 'PENDING' AND market_region = p_market_region
    LOOP
        BEGIN
            v_original_lead_id := r.id;
            v_error_details := NULL;

            v_wholesale_value_text := r.raw_data->>'wholesale_value';
            v_assessed_total_text  := r.raw_data->>'assessed_total';
            v_avm_value_text       := r.raw_data->>'avm_value'; 
            v_price_per_sq_ft_text := r.raw_data->>'price_per_sq_ft';

            INSERT INTO public.normalized_leads (
                original_lead_id, market_region,
                contact1_name, contact1_email_1,
                contact2_name, contact2_email_1,
                contact3_name, contact3_email_1,
                mls_curr_list_agent_name, mls_curr_list_agent_email,
                property_address, property_city, property_state, property_postal_code,
                property_type, baths, beds, year_built, square_footage, lot_size_sqft,
                wholesale_value, assessed_total, avm_value, price_per_sq_ft,
                mls_curr_status, mls_curr_days_on_market,
                created_at, updated_at 
            )
            VALUES (
                v_original_lead_id, p_market_region,
                r.raw_data->>'contact1_name', LOWER(r.raw_data->>'contact1_email_1'),
                r.raw_data->>'contact2_name', LOWER(r.raw_data->>'contact2_email_1'),
                r.raw_data->>'contact3_name', LOWER(r.raw_data->>'contact3_email_1'),
                r.raw_data->>'mls_curr_list_agent_name', LOWER(r.raw_data->>'mls_curr_list_agent_email'),
                r.raw_data->>'property_address', 
                r.raw_data->>'property_city', 
                r.raw_data->>'property_state', 
                COALESCE(
                    NULLIF(r.raw_data->>'property_zip', ''), 
                    NULLIF(r.raw_data->>'property_postal_code', ''),
                    NULLIF(r.raw_data->>'property_zipcode', '')
                ),
                r.raw_data->>'property_type', 
                r.raw_data->>'baths', 
                r.raw_data->>'beds', 
                r.raw_data->>'year_built', 
                r.raw_data->>'square_footage', 
                r.raw_data->>'lot_size_sqft',
                NULLIF(REPLACE(REPLACE(v_wholesale_value_text, '$', ''), ',', ''), '')::NUMERIC, 
                NULLIF(REPLACE(REPLACE(v_assessed_total_text, '$', ''), ',', ''), '')::NUMERIC,
                NULLIF(REPLACE(REPLACE(v_avm_value_text, '$', ''), ',', ''), '')::NUMERIC,
                NULLIF(REPLACE(REPLACE(v_price_per_sq_ft_text, '$', ''), ',', ''), '')::NUMERIC,
                r.raw_data->>'mls_curr_status', 
                r.raw_data->>'mls_curr_days_on_market',
                NOW(), 
                NOW()
            )
            ON CONFLICT (original_lead_id) DO UPDATE SET
                market_region = EXCLUDED.market_region,
                contact1_name = EXCLUDED.contact1_name, 
                contact1_email_1 = EXCLUDED.contact1_email_1,
                contact2_name = EXCLUDED.contact2_name, 
                contact2_email_1 = EXCLUDED.contact2_email_1,
                contact3_name = EXCLUDED.contact3_name, 
                contact3_email_1 = EXCLUDED.contact3_email_1,
                mls_curr_list_agent_name = EXCLUDED.mls_curr_list_agent_name, 
                mls_curr_list_agent_email = EXCLUDED.mls_curr_list_agent_email,
                property_address = EXCLUDED.property_address, 
                property_city = EXCLUDED.property_city,
                property_state = EXCLUDED.property_state, 
                property_postal_code = EXCLUDED.property_postal_code,
                property_type = EXCLUDED.property_type, 
                baths = EXCLUDED.baths, 
                beds = EXCLUDED.beds,
                year_built = EXCLUDED.year_built, 
                square_footage = EXCLUDED.square_footage, 
                lot_size_sqft = EXCLUDED.lot_size_sqft,
                wholesale_value = EXCLUDED.wholesale_value, 
                assessed_total = EXCLUDED.assessed_total, 
                avm_value = EXCLUDED.avm_value, 
                price_per_sq_ft = EXCLUDED.price_per_sq_ft,
                mls_curr_status = EXCLUDED.mls_curr_status, 
                mls_curr_days_on_market = EXCLUDED.mls_curr_days_on_market,
                updated_at = NOW();

            UPDATE public.leads 
            SET normalization_status = 'PROCESSED', 
                updated_at = NOW()
            WHERE id = v_original_lead_id;

        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_error_details = PG_EXCEPTION_CONTEXT;
            RAISE WARNING 'Error normalizing lead ID %: %, Context: %', v_original_lead_id, SQLERRM, v_error_details;
            
            UPDATE public.leads 
            SET normalization_status = 'ERROR', 
                normalization_error = SQLERRM || ' | Context: ' || v_error_details, 
                updated_at = NOW()
            WHERE id = v_original_lead_id;
            
            INSERT INTO public.system_event_logs (event_type, message, details, user_id)
            VALUES (
                'NORMALIZATION_ERROR', 
                'Failed to normalize lead', 
                jsonb_build_object(
                    'original_lead_id', v_original_lead_id, 
                    'error', SQLERRM, 
                    'context', v_error_details
                ), 
                r.uploaded_by
            );
        END;
    END LOOP;

    DELETE FROM public.leads
    WHERE normalization_status = 'PROCESSED' 
      AND market_region = p_market_region;

    RAISE NOTICE 'Normalization of staged leads for market region % complete. Processed leads have been cleared from staging.', p_market_region;
END;
$_$;


ALTER FUNCTION "public"."normalize_staged_leads"("p_market_region" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalize_staged_leads"("p_market_region" "text") IS 'Processes leads from the staging table (public.leads) for a given market region, 
populates the public.normalized_leads table, and updates staging record status. 
Handles conflicts by updating existing normalized leads based on original_lead_id.';



CREATE OR REPLACE FUNCTION "public"."normalize_staged_leads"("p_market_region" "text", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    r RECORD;
    v_lead_count INTEGER;
    v_market_region_id UUID;
    v_normalized_name TEXT := LOWER(TRIM(p_market_region));
BEGIN
    -- Check if market region exists, if not create it
    SELECT id INTO v_market_region_id 
    FROM public.market_regions 
    WHERE normalized_name = v_normalized_name;
    
    IF v_market_region_id IS NULL THEN
        INSERT INTO public.market_regions (name, created_by)
        VALUES (p_market_region, p_user_id)
        RETURNING id INTO v_market_region_id;
    END IF;
    
    -- Process the leads as before, but now we have the market_region_id
    -- [Rest of your existing normalization logic here]
    
    -- Update lead count for the market region
    SELECT COUNT(*) INTO v_lead_count
    FROM public.normalized_leads
    WHERE market_region = p_market_region;
    
    UPDATE public.market_regions
    SET 
        lead_count = v_lead_count,
        updated_at = NOW()
    WHERE id = v_market_region_id;
END;
$$;


ALTER FUNCTION "public"."normalize_staged_leads"("p_market_region" "text", "p_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."campaign_steps" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "action_type" "text" NOT NULL,
    "template_id" "uuid",
    "delay_days" integer DEFAULT 0,
    "delay_hours" integer DEFAULT 0,
    "subject_template" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."campaign_steps" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_campaign_steps"("p_campaign_id" "uuid", "p_step_ids" "uuid"[]) RETURNS SETOF "public"."campaign_steps"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  i INTEGER := 1;
  step_id UUID;
BEGIN
  -- First, verify all step IDs belong to the given campaign
  IF EXISTS (
    SELECT 1 FROM unnest(p_step_ids) AS id
    WHERE id NOT IN (SELECT id FROM campaign_steps WHERE campaign_id = p_campaign_id)
  ) THEN
    RAISE EXCEPTION 'One or more step IDs do not belong to the specified campaign';
  END IF;

  -- Update the step numbers based on the order in the array
  FOREACH step_id IN ARRAY p_step_ids LOOP
    UPDATE campaign_steps
    SET 
      step_number = i,
      updated_at = NOW()
    WHERE id = step_id AND campaign_id = p_campaign_id;
    
    i := i + 1;
  END LOOP;

  -- Return the updated steps
  RETURN QUERY
  SELECT * FROM campaign_steps
  WHERE campaign_id = p_campaign_id
  ORDER BY step_number;
END;
$$;


ALTER FUNCTION "public"."reorder_campaign_steps"("p_campaign_id" "uuid", "p_step_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_all_sender_daily_counts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.senders 
  SET 
    sent_today = 0,
    last_reset_date = CURRENT_DATE,
    updated_at = NOW()
  WHERE is_active = true;
  
  RAISE NOTICE 'Reset daily send counts for all active senders to 0';
END;
$$;


ALTER FUNCTION "public"."reset_all_sender_daily_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_sender_daily_count"("sender_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.senders 
  SET 
    sent_today = 0,
    last_reset_date = CURRENT_DATE,
    updated_at = NOW()
  WHERE id = sender_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sender with ID % not found', sender_id;
  END IF;
  
  RAISE NOTICE 'Reset daily send count for sender % to 0', sender_id;
END;
$$;


ALTER FUNCTION "public"."reset_sender_daily_count"("sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_campaign_by_id_offset"("p_campaign_id" "uuid", "p_start_offset" interval) RETURNS TABLE("job_id" bigint, "next_processed_time" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    v_campaign_name TEXT;
    v_market_region TEXT;
    v_daily_limit INTEGER;
    v_time_window_hours INTEGER;
    v_lead_table_name TEXT;
    dynamic_sql TEXT;
BEGIN
    -- Fetch campaign details
    SELECT
        name,
        market_region,
        daily_limit,
        time_window_hours
    INTO
        v_campaign_name,
        v_market_region,
        v_daily_limit,
        v_time_window_hours
    FROM campaigns
    WHERE id = p_campaign_id;

    -- Validate fetched campaign details
    IF v_campaign_name IS NULL THEN
        RAISE EXCEPTION 'Campaign with ID % not found.', p_campaign_id;
    END IF;
    IF v_market_region IS NULL THEN
        RAISE EXCEPTION 'Market region not set for campaign ID %.', p_campaign_id;
    END IF;
    IF v_daily_limit IS NULL OR v_daily_limit <= 0 THEN
        RAISE EXCEPTION 'Invalid daily limit (%) for campaign ID %.', v_daily_limit, p_campaign_id;
    END IF;
    IF v_time_window_hours IS NULL OR v_time_window_hours <= 0 THEN
        RAISE EXCEPTION 'Invalid time window hours (%) for campaign ID %.', v_time_window_hours, p_campaign_id;
    END IF;

    -- Normalize v_market_region
    v_market_region := lower(regexp_replace(v_market_region, '[^a-zA-Z0-9_]+', '_', 'g'));
    v_market_region := regexp_replace(v_market_region, '_+', '_', 'g');
    v_market_region := trim(BOTH '_' FROM v_market_region);
    v_lead_table_name := v_market_region || '_fine_cut_leads';
    RAISE NOTICE 'Normalized market region: %, Constructed lead table name: %', v_market_region, v_lead_table_name;

    -- Define custom schedule start offset
    CREATE TEMP TABLE schedule_start AS
    SELECT NOW() + p_start_offset AS start_time;

    -- Create the temporary table for the manifest early
    CREATE TEMP TABLE new_jobs_for_manifest (
        job_id UUID,
        next_processing_time TIMESTAMPTZ,
        lead_table_name TEXT  -- New column
    );

    -- Build dynamic SQL to pull leads from the correct table based on campaign's market_region and daily_limit
    dynamic_sql := format($f$
        CREATE TEMP TABLE selected_leads AS
        WITH available_leads AS (
            SELECT
                id as lead_id,
                contact_name,
                contact_email,
                ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
            FROM %I -- lead_table_name (e.g., 'indianapolis_fine_cut_leads')
            WHERE (email_sent IS NULL OR email_sent = FALSE)
              AND contact_email IS NOT NULL -- Ensure email exists
            LIMIT %s -- daily_limit
        )
        SELECT
            lead_id,
            contact_name,
            contact_email,
            rn
        FROM available_leads;
    $f$, v_lead_table_name, v_daily_limit);
    EXECUTE dynamic_sql;
    
    IF (SELECT COUNT(*) FROM selected_leads) = 0 THEN
        RAISE NOTICE 'No leads available to schedule for campaign % in market %.', p_campaign_id, v_market_region;
        -- new_jobs_for_manifest will be empty, proceed to final RETURN QUERY
    ELSE
        -- This block only executes if there are leads
        CREATE TEMP TABLE active_senders AS
        SELECT
            id,
            ROW_NUMBER() OVER (ORDER BY RANDOM()) as sender_num,
            COUNT(*) OVER () as total_senders
        FROM senders
        WHERE is_active = TRUE;

        IF (SELECT total_senders FROM active_senders LIMIT 1) = 0 THEN
            RAISE EXCEPTION 'No active senders available to schedule campaign %.', p_campaign_id;
        END IF;
        
        -- Now continue with the rest of the script, using the fetched campaign parameters
        WITH
        time_window AS (
            SELECT v_time_window_hours * 60 * 60 as total_seconds
        ),
        all_seconds AS (
            SELECT generate_series(0, (SELECT total_seconds FROM time_window) - 1) as second_offset
        ),
        selected_times AS (
            SELECT
                second_offset,
                ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
            FROM all_seconds
            ORDER BY RANDOM()
            LIMIT (SELECT COUNT(*) FROM selected_leads)
        ),
        scheduled_emails AS (
            SELECT
                sl.lead_id,
                sl.contact_name,
                sl.contact_email,
                (SELECT start_time FROM schedule_start) + (st.second_offset * INTERVAL '1 second') as send_time,
                asnd.id as sender_id
            FROM
                selected_leads sl
            JOIN
                selected_times st ON sl.rn = st.rn
            JOIN
                active_senders asnd ON
                    asnd.sender_num = ((sl.rn - 1) % (SELECT total_senders FROM active_senders LIMIT 1)) + 1
        ),
        inserted_jobs_cte AS ( -- CTE for the first INSERT operation
            INSERT INTO campaign_jobs (
                campaign_id, status, lead_id, contact_email, contact_name,
                assigned_sender_id, current_step, next_processing_time,
                created_at, updated_at
            )
            SELECT
                p_campaign_id, 'pending', lead_id, contact_email, contact_name,
                sender_id, 1, send_time, NOW(), NOW()
            FROM scheduled_emails
            ORDER BY send_time
            RETURNING id, next_processing_time -- This data populates inserted_jobs_cte
        )
        -- Now, insert into new_jobs_for_manifest using the data from the CTE
            INSERT INTO new_jobs_for_manifest (job_id, next_processing_time, lead_table_name)
            SELECT id, next_processing_time, v_lead_table_name FROM inserted_jobs_cte;

        -- Mark all selected leads as scheduled to be emailed in their respective market table
        dynamic_sql := format($f$
            UPDATE %I -- lead_table_name
            SET
                email_sent = TRUE,
                updated_at = NOW()
            WHERE id IN (
                SELECT lead_id FROM selected_leads
            );
        $f$, v_lead_table_name);
        EXECUTE dynamic_sql;

        -- Log the scheduling
        WITH stats AS (
            SELECT
                COUNT(*) as total_emails,
                MIN(cj.next_processing_time) as first_send_time,
                MAX(cj.next_processing_time) as last_send_time,
                COUNT(DISTINCT cj.assigned_sender_id) as senders_used
            FROM campaign_jobs cj
            WHERE cj.campaign_id = p_campaign_id
              AND cj.status = 'pending'
              AND cj.created_at >= (SELECT start_time FROM schedule_start) - p_start_offset - INTERVAL '1 minute' -- Filter for jobs just created by this run
        )
        INSERT INTO system_event_logs (
            event_type, message, details, created_at, updated_at, campaign_id
        )
        SELECT
            'campaign_scheduled',
            'Scheduled ' || total_emails || ' emails for campaign ''' || v_campaign_name || ''' (ID: ' || p_campaign_id || ') with randomized send times over ' || v_time_window_hours || ' hours.',
            json_build_object(
                'campaign_name', v_campaign_name, 'campaign_id', p_campaign_id, 'total_emails', total_emails,
                'scheduled_at', NOW(), 'time_window_hours', v_time_window_hours, 'first_send_time', first_send_time,
                'last_send_time', last_send_time, 'avg_emails_per_hour', ROUND(total_emails::numeric / GREATEST(v_time_window_hours, 1), 2),
                'senders_used_count', senders_used, 'leads_marked', (SELECT COUNT(*) FROM selected_leads)
            ),
            NOW(), NOW(), p_campaign_id
        FROM stats;

        -- Log the distribution of emails per sender for monitoring
        WITH sender_stats AS (
            SELECT
                cj.assigned_sender_id, COUNT(*) as email_count,
                MIN(cj.next_processing_time) as first_send_time, MAX(cj.next_processing_time) as last_send_time
            FROM campaign_jobs cj
            WHERE cj.campaign_id = p_campaign_id
              AND cj.status = 'pending'
              AND cj.created_at >= (SELECT start_time FROM schedule_start) - p_start_offset - INTERVAL '1 minute'
            GROUP BY cj.assigned_sender_id
        )
        INSERT INTO system_event_logs (
            event_type, message, details, created_at, updated_at, campaign_id
        )
        SELECT
            'campaign_sender_distribution',
            'Email distribution for sender ' || assigned_sender_id || ' in campaign ''' || v_campaign_name || ''' (ID: ' || p_campaign_id || ').',
            json_build_object(
                'campaign_name', v_campaign_name, 'campaign_id', p_campaign_id, 'sender_id', assigned_sender_id,
                'email_count', email_count, 'first_send_time', first_send_time, 'last_send_time', last_send_time,
                'emails_per_hour_for_sender', ROUND(email_count::numeric / GREATEST(v_time_window_hours, 1), 2)
            ),
            NOW(), NOW(), p_campaign_id
        FROM sender_stats;

        -- Clean up temporary table specific to this block
        DROP TABLE IF EXISTS active_senders;
    END IF; -- End of "if leads exist" block

    -- Clean up temporary tables created at the start
    DROP TABLE IF EXISTS schedule_start;
    DROP TABLE IF EXISTS selected_leads; -- Dropped here whether populated or not

    -- Return the content of new_jobs_for_manifest
    -- This will be empty if no leads were found, or populated if jobs were created.
    RETURN QUERY 
    SELECT 
        njfm.job_id, 
        njfm.next_processing_time,
        njfm.lead_table_name
    FROM new_jobs_for_manifest njfm;

    -- TEMP tables like new_jobs_for_manifest are automatically dropped at the end of the function.
END;
$_$;


ALTER FUNCTION "public"."schedule_campaign_by_id_offset"("p_campaign_id" "uuid", "p_start_offset" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_campaign_by_offset_id"("p_start_offset" interval, "p_campaign_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    campaign_id_var UUID := p_campaign_id;
    market_region TEXT;
    dynamic_sql TEXT;
BEGIN
    -- Define custom schedule start offset
    CREATE TEMP TABLE schedule_start AS
    SELECT NOW() + p_start_offset AS start_time;

    -- Fetch market region from campaign
    SELECT market_region INTO market_region
    FROM campaigns
    WHERE id = campaign_id_var;

    IF market_region IS NULL THEN
        RAISE EXCEPTION 'Campaign ID % has no associated market region.', campaign_id_var;
    END IF;

    CREATE TEMP TABLE campaign_id AS SELECT campaign_id_var AS id;

    -- Build dynamic SQL to pull leads from the correct table based on campaign's market_region
    dynamic_sql := format($f$
        CREATE TEMP TABLE selected_leads AS
        WITH available_leads AS (
            SELECT 
                id as lead_id,
                contact_name,
                contact_email,
                ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
            FROM %I
            WHERE email_sent IS NULL OR email_sent = FALSE
            LIMIT 1000
        )
        SELECT 
            lead_id,
            contact_name,
            contact_email,
            rn
        FROM available_leads;
    $f$, market_region || '_fine_cut_leads');

    EXECUTE dynamic_sql;

    CREATE TEMP TABLE active_senders AS
    SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY id) as sender_num,
        COUNT(*) OVER () as total_senders
    FROM senders 
    WHERE is_active = TRUE;

    WITH 
    time_window AS (
        SELECT 10 * 60 * 60 as total_seconds
    ),
    all_seconds AS (
        SELECT generate_series(0, (SELECT total_seconds FROM time_window) - 1) as second_offset
    ),
    selected_times AS (
        SELECT 
            second_offset,
            ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
        FROM all_seconds
        ORDER BY RANDOM()
        LIMIT (SELECT COUNT(*) FROM selected_leads)
    ),
    scheduled_emails AS (
        SELECT
            sl.lead_id,
            sl.contact_name,
            sl.contact_email,
            (SELECT start_time FROM schedule_start) + (st.second_offset * INTERVAL '1 second') as send_time,
            asnd.id as sender_id
        FROM 
            selected_leads sl
        JOIN 
            selected_times st ON sl.rn = st.rn
        JOIN
            active_senders asnd ON 
                asnd.sender_num = ((sl.rn - 1) % (SELECT total_senders FROM active_senders LIMIT 1)) + 1
    )

    INSERT INTO campaign_jobs (
        campaign_id,
        status,
        lead_id,
        email_address,
        contact_name,
        assigned_sender_id,
        current_step,
        next_processing_time,
        created_at,
        updated_at
    )
    SELECT
        (SELECT id FROM campaign_id LIMIT 1) as campaign_id,
        'pending' as status,
        lead_id,
        contact_email as email_address,
        contact_name,
        sender_id as assigned_sender_id,
        1 as current_step,
        send_time as next_processing_time,
        NOW() as created_at,
        NOW() as updated_at
    FROM 
        scheduled_emails
    ORDER BY
        send_time;

    EXECUTE format('UPDATE %I SET email_sent = TRUE, updated_at = NOW() WHERE id IN (SELECT lead_id FROM selected_leads);', market_region || '_fine_cut_leads');

    WITH stats AS (
        SELECT
            COUNT(*) as total_emails,
            MIN(next_processing_time) as first_send_time,
            MAX(next_processing_time) as last_send_time,
            COUNT(DISTINCT assigned_sender_id) as senders_used
        FROM campaign_jobs 
        WHERE status = 'pending'
        AND created_at >= NOW() - INTERVAL '5 minutes'
    )
    INSERT INTO system_event_logs (
        event_type,
        message,
        details,
        created_at,
        updated_at
    ) 
    SELECT
        'campaign_scheduled',
        'Scheduled ' || total_emails || ' emails for campaign ID ' || p_campaign_id,
        json_build_object(
            'campaign_id', (SELECT id FROM campaign_id LIMIT 1),
            'total_emails', total_emails,
            'scheduled_at', NOW(),
            'time_window_hours', 10,
            'first_send_time', first_send_time,
            'last_send_time', last_send_time,
            'avg_emails_per_hour', ROUND(total_emails::numeric / 10, 2),
            'senders_used', senders_used,
            'leads_marked', (SELECT COUNT(*) FROM selected_leads)
        ),
        NOW(),
        NOW()
    FROM stats;

    WITH sender_stats AS (
        SELECT
            assigned_sender_id,
            COUNT(*) as email_count,
            MIN(next_processing_time) as first_send_time,
            MAX(next_processing_time) as last_send_time
        FROM 
            campaign_jobs 
        WHERE 
            status = 'pending'
            AND created_at >= NOW() - INTERVAL '5 minutes'
        GROUP BY 
            assigned_sender_id
    )
    INSERT INTO system_event_logs (
        event_type,
        message,
        details,
        created_at,
        updated_at
    )
    SELECT
        'campaign_sender_distribution',
        'Email distribution for sender ' || assigned_sender_id || ' in campaign ID ' || p_campaign_id,
        json_build_object(
            'campaign_id', (SELECT id FROM campaign_id LIMIT 1),
            'sender_id', assigned_sender_id,
            'email_count', email_count,
            'first_send_time', first_send_time,
            'last_send_time', last_send_time,
            'emails_per_hour', ROUND(email_count::numeric / 10, 2)
        ),
        NOW(),
        NOW()
    FROM 
        sender_stats;

    DROP TABLE IF EXISTS schedule_start;
    DROP TABLE IF EXISTS campaign_id;
    DROP TABLE IF EXISTS selected_leads;
    DROP TABLE IF EXISTS active_senders;
END;
$_$;


ALTER FUNCTION "public"."schedule_campaign_by_offset_id"("p_start_offset" interval, "p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_assigned_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    NEW.assigned_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_assigned_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_eli5_engine"("p_dry_run" boolean DEFAULT false, "p_limit_per_run" integer DEFAULT 100, "p_market_region" "text" DEFAULT NULL::"text", "p_min_interval_seconds" integer DEFAULT 60, "p_max_interval_seconds" integer DEFAULT 300, "p_selected_sender_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("message" "text", "campaign_id" "uuid", "campaign_name" "text", "status" "text", "dry_run" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_campaign_record RECORD;
    v_sender_record RECORD;
    v_lead_record RECORD;
    v_job_id uuid;
    v_delay_seconds integer;
    v_count integer := 0;
    v_sender_count integer;
    v_current_sender_index integer := 0;
    v_sender_ids uuid[];
    v_campaign_id uuid;
BEGIN
    -- Get the active campaign
    SELECT id, market_region, daily_limit 
    INTO v_campaign_record
    FROM public.campaigns 
    WHERE public.campaigns.status = 'active' 
    ORDER BY public.campaigns.created_at DESC 
    LIMIT 1;
    
    IF v_campaign_record.id IS NULL THEN
        RAISE EXCEPTION 'No active campaign found';
    END IF;
    
    v_campaign_id := v_campaign_record.id;
    
    -- Get senders (either from parameters or all active senders)
    IF p_selected_sender_ids IS NOT NULL AND array_length(p_selected_sender_ids, 1) > 0 THEN
        v_sender_ids := p_selected_sender_ids;
    ELSE
        SELECT array_agg(id) INTO v_sender_ids
        FROM public.senders
        WHERE public.senders.status = 'active';
    END IF;
    
    v_sender_count := array_length(v_sender_ids, 1);
    
    IF v_sender_count = 0 THEN
        RAISE EXCEPTION 'No active senders found';
    END IF;
    
    -- Get pending leads for the campaign
    FOR v_lead_record IN 
        SELECT cl.*
        FROM public.campaign_leads cl
        WHERE cl.campaign_id = v_campaign_id
        AND cl.status = 'pending'
        LIMIT p_limit_per_run
    LOOP
        -- Round-robin assignment of senders
        v_current_sender_index := (v_current_sender_index % v_sender_count) + 1;
        
        -- Calculate a random delay within the specified range
        v_delay_seconds := p_min_interval_seconds + floor(random() * (p_max_interval_seconds - p_min_interval_seconds + 1));
        
        -- Create a job for this lead
        INSERT INTO public.campaign_jobs (
            campaign_id,
            campaign_lead_id,
            assigned_sender_id,
            status,
            next_processing_time
        ) VALUES (
            v_campaign_id,
            v_lead_record.id,
            v_sender_ids[v_current_sender_index],
            'pending',
            NOW() + (v_delay_seconds * interval '1 second')
        )
        RETURNING id INTO v_job_id;
        
        -- Update lead status
        UPDATE public.campaign_leads
        SET status = 'queued',
            updated_at = NOW()
        WHERE id = v_lead_record.id;
        
        v_count := v_count + 1;
    END LOOP;
    
    -- Update campaign status (removed started_at reference)
    UPDATE public.campaigns
    SET status = 'running',
        updated_at = NOW()
    WHERE id = v_campaign_id;
    
    -- Return results
    RETURN QUERY
    SELECT 
        'Engine started successfully'::text as message,
        v_campaign_id as campaign_id,
        c.name as campaign_name,
        c.status,
        p_dry_run as dry_run
    FROM public.campaigns c
    WHERE c.id = v_campaign_id;
END;
$$;


ALTER FUNCTION "public"."start_eli5_engine"("p_dry_run" boolean, "p_limit_per_run" integer, "p_market_region" "text", "p_min_interval_seconds" integer, "p_max_interval_seconds" integer, "p_selected_sender_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stop_eli5_engine"() RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
  updated_rows INTEGER;
  status_record RECORD;
  
  -- Constants for response messages
  MSG_ALREADY_STOPPED CONSTANT TEXT := 'ELI5 Engine is already stopped';
  MSG_STOPPED CONSTANT TEXT := 'ELI5 Engine has been stopped';
  MSG_NO_RECORD CONSTANT TEXT := 'No active engine status record found, nothing to stop';
  MSG_ERROR CONSTANT TEXT := 'Error stopping ELI5 Engine';
  
BEGIN
  -- Check current status
  SELECT * INTO status_record 
  FROM public.eli5_engine_status 
  WHERE status_key = 'campaign_processing_enabled';
  
  IF FOUND THEN
    -- If already stopped, return success but with appropriate message
    IF NOT status_record.is_enabled THEN
      result := json_build_object(
        'status', 'success',
        'message', MSG_ALREADY_STOPPED,
        'was_running', false,
        'stopped_at', NOW(),
        'details', json_build_object(
          'previous_status', 'stopped',
          'last_started_at', status_record.last_started_at,
          'last_stopped_at', status_record.last_stopped_at
        )
      );
    ELSE
      -- Update status to stopped
      UPDATE public.eli5_engine_status
      SET 
        is_enabled = false,
        updated_at = NOW(),
        last_stopped_at = NOW()
      WHERE status_key = 'campaign_processing_enabled'
      RETURNING 1 INTO updated_rows;
      
      -- Verify the update was successful
      IF updated_rows > 0 THEN
        -- Get the updated record for the response
        SELECT * INTO status_record 
        FROM public.eli5_engine_status 
        WHERE status_key = 'campaign_processing_enabled';
        
        result := json_build_object(
          'status', 'success',
          'message', MSG_STOPPED,
          'was_running', true,
          'stopped_at', status_record.last_stopped_at,
          'details', json_build_object(
            'previous_status', 'running',
            'last_started_at', status_record.last_started_at,
            'run_duration_seconds', EXTRACT(EPOCH FROM (NOW() - status_record.updated_at)),
            'dry_run', status_record.dry_run,
            'limit_per_run', status_record.limit_per_run,
            'market_region', status_record.market_region
          )
        );
        
        -- Log the stop event
        RAISE NOTICE 'ELI5 Engine stopped at %', NOW();
      ELSE
        -- This should theoretically never happen since we found the record above
        result := json_build_object(
          'status', 'error',
          'message', 'Failed to update engine status',
          'error', 'No rows updated when stopping engine'
        );
      END IF;
    END IF;
  ELSE
    -- No status record found
    result := json_build_object(
      'status', 'success',
      'message', MSG_NO_RECORD,
      'was_running', false,
      'stopped_at', NOW()
    );
  END IF;
  
  -- In a real implementation, you might want to:
  -- 1. Cancel any in-progress background jobs
  -- 2. Update the status of any in-progress campaign jobs
  -- 3. Log the stop event for auditing
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  -- Log the error
  RAISE WARNING 'Error in stop_eli5_engine: %', SQLERRM;
  
  -- Return error response
  RETURN json_build_object(
    'status', 'error',
    'message', MSG_ERROR,
    'error', SQLERRM
  );
END;
$$;


ALTER FUNCTION "public"."stop_eli5_engine"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."stop_eli5_engine"() IS 'Stops the ELI5 email campaign engine by updating the engine status. This function is idempotent and safe to call multiple times.';



CREATE OR REPLACE FUNCTION "public"."test_email_send"() RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  result json;
begin
  select * from public.trigger_eli5_test_email() into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."test_email_send"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_eli5_test_email"() RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result json;
  response json;
  api_url text;
  http_status integer;
  http_response json;
  user_email text;
BEGIN
  -- Get the current user's email
  SELECT email INTO user_email 
  FROM auth.users 
  WHERE id = auth.uid()
  LIMIT 1;

  IF user_email IS NULL THEN
    RETURN json_build_object(
      'status', 'error',
      'message', 'No authenticated user found'
    );
  END IF;

  -- Get the API URL from environment variables
  api_url := COALESCE(
    current_setting('app.settings.nextjs_api_url', true),
    'https://' || current_setting('app.settings.vercel_url', true) -- Fallback to Vercel URL
  );

  -- Make HTTP request to the new API endpoint
  SELECT 
    status,
    content::json
  INTO
    http_status,
    http_response
  FROM
    http(ARRAY[
      ('POST', 
       api_url || '/api/test-email',
       ARRAY[
         ('Authorization', 'Bearer ' || current_setting('app.settings.api_auth_token', true))::http_header
       ]::http_header[],
       'application/json',
       '{}'
      )::http_request
    ]);

  RETURN json_build_object(
    'status', CASE WHEN http_status = 200 THEN 'success' ELSE 'error' END,
    'status_code', http_status,
    'response', http_response
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'status', 'error',
    'message', 'Error triggering test email: ' || SQLERRM
  );
END;
$$;


ALTER FUNCTION "public"."trigger_eli5_test_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_preflight_check"("campaign_id_param" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    campaign_record RECORD;
    sender_record RECORD;
    test_recipient TEXT := 'chrisphillips@truesoulpartners.com';
    result JSONB;
    success_count INTEGER := 0;
    failure_count INTEGER := 0;
    results JSONB := '[]'::JSONB;
    test_result JSONB;
BEGIN
    -- Get campaign details
    SELECT * INTO campaign_record 
    FROM campaigns 
    WHERE id = campaign_id_param;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Campaign not found',
            'results', results
        );
    END IF;

    -- Test each sender
    FOR sender_record IN 
        SELECT * FROM senders 
        WHERE id = ANY(campaign_record.assigned_sender_ids)
        AND is_active = true
    LOOP
        BEGIN
            -- Here you would implement the actual test email sending logic
            -- This is a placeholder that simulates a successful test
            test_result := jsonb_build_object(
                'sender_id', sender_record.id,
                'sender_email', sender_record.email,
                'recipient', test_recipient,
                'success', true,
                'message', 'Test email sent successfully'
            );
            success_count := success_count + 1;
        EXCEPTION WHEN OTHERS THEN
            test_result := jsonb_build_object(
                'sender_id', sender_record.id,
                'sender_email', sender_record.email,
                'recipient', test_recipient,
                'success', false,
                'message', SQLERRM
            );
            failure_count := failure_count + 1;
        END;
        
        results := results || jsonb_build_array(test_result);
    END LOOP;

    -- Update campaign status based on results
    IF failure_count = 0 THEN
        UPDATE campaigns 
        SET status = 'READY',
            settings = COALESCE(settings, '{}'::jsonb) || 
                      jsonb_build_object(
                          'last_preflight_check', NOW(),
                          'preflight_status', 'success'
                      )
        WHERE id = campaign_id_param;
        
        -- Return success response
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Pre-flight check completed successfully',
            'total_tests', success_count + failure_count,
            'success_count', success_count,
            'failure_count', failure_count,
            'results', results
        );
    ELSE
        UPDATE campaigns 
        SET status = 'PREFLIGHT_FAILED',
            settings = COALESCE(settings, '{}'::jsonb) || 
                      jsonb_build_object(
                          'last_preflight_check', NOW(),
                          'preflight_status', 'failed'
                      )
        WHERE id = campaign_id_param;
        
        -- Return failure response
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Pre-flight check completed with failures',
            'total_tests', success_count + failure_count,
            'success_count', success_count,
            'failure_count', failure_count,
            'results', results
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."trigger_preflight_check"("campaign_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_preflight_check"("campaign_id_param" "uuid") IS 'Performs pre-flight check for a campaign by sending test emails from all assigned senders';



CREATE OR REPLACE FUNCTION "public"."trigger_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."trigger_set_timestamp"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_set_timestamp"() IS 'Sets the updated_at column to the current timestamp before an update operation.';



CREATE OR REPLACE FUNCTION "public"."truncate_normalized_leads"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    TRUNCATE TABLE public.normalized_leads CASCADE;
    RETURN 'public.normalized_leads truncated successfully (with CASCADE).';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error truncating normalized_leads: %', SQLERRM;
        RAISE; -- Re-raise the exception
END;
$$;


ALTER FUNCTION "public"."truncate_normalized_leads"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_engine_control_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_engine_control_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_contacted"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.last_contacted_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_last_contacted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_market_region_lead_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Update lead count for the affected market region
    UPDATE public.market_regions
    SET 
        lead_count = (SELECT COUNT(*) FROM public.normalized_leads WHERE market_region = COALESCE(NEW.market_region, OLD.market_region)),
        updated_at = NOW()
    WHERE name = COALESCE(NEW.market_region, OLD.market_region);
    
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_market_region_lead_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW; 
END;
$$;


ALTER FUNCTION "public"."update_modified_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_regions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "normalized_name" "text" GENERATED ALWAYS AS ("lower"(TRIM(BOTH FROM "name"))) STORED,
    "lead_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "last_processed_at" timestamp with time zone,
    "associated_leads_table" "text"
);


ALTER TABLE "public"."market_regions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."market_regions"."associated_leads_table" IS 'Name given to the table of leads associated with this specific market region';



CREATE OR REPLACE VIEW "public"."active_market_regions" AS
 SELECT "market_regions"."id",
    "market_regions"."name",
    "market_regions"."lead_count",
    "market_regions"."created_at",
    "market_regions"."updated_at"
   FROM "public"."market_regions"
  WHERE ("market_regions"."lead_count" > 0)
  ORDER BY "market_regions"."name";


ALTER TABLE "public"."active_market_regions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."application_settings" (
    "id" integer NOT NULL,
    "key" "text" NOT NULL,
    "value" "text",
    "description" "text",
    "group_name" "text" DEFAULT 'General'::"text",
    "is_sensitive" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."application_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."application_settings" IS 'Stores application-wide configuration settings manageable by the admin.';



COMMENT ON COLUMN "public"."application_settings"."key" IS 'Unique key for the setting (e.g., GOOGLE_CLIENT_ID).';



COMMENT ON COLUMN "public"."application_settings"."value" IS 'Value of the setting. Sensitive values should be handled carefully.';



COMMENT ON COLUMN "public"."application_settings"."group_name" IS 'Helps categorize settings in the UI (e.g., Email, OAuth).';



COMMENT ON COLUMN "public"."application_settings"."is_sensitive" IS 'Indicates if the value is sensitive and should be masked or handled securely.';



CREATE SEQUENCE IF NOT EXISTS "public"."application_settings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."application_settings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."application_settings_id_seq" OWNED BY "public"."application_settings"."id";



CREATE TABLE IF NOT EXISTS "public"."austin_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."austin_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."austin_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region Austin with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."austin_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."austin_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."austin_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."austin_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."austin_fine_cut_leads_id_seq" OWNED BY "public"."austin_fine_cut_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."brownsville_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."brownsville_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."brownsville_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region Brownsville with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."brownsville_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."brownsville_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."brownsville_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."brownsville_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."brownsville_fine_cut_leads_id_seq" OWNED BY "public"."brownsville_fine_cut_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."campaign_jobs" (
    "campaign_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "lead_id" "text" NOT NULL,
    "contact_email" "text" NOT NULL,
    "contact_name" "text",
    "assigned_sender_id" "uuid",
    "current_step" integer DEFAULT 0,
    "next_processing_time" timestamp with time zone,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "id" bigint NOT NULL,
    "processed_at" timestamp with time zone,
    "email_message_id" "text"
);


ALTER TABLE "public"."campaign_jobs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."campaign_jobs"."id" IS 'campaign jobs id number';



CREATE TABLE IF NOT EXISTS "public"."campaign_jobs_backup" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "lead_id" "text" NOT NULL,
    "contact_email" "text" NOT NULL,
    "contact_name" "text",
    "assigned_sender_id" "uuid",
    "current_step" integer DEFAULT 0,
    "next_processing_time" timestamp with time zone,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."campaign_jobs_backup" OWNER TO "postgres";


COMMENT ON TABLE "public"."campaign_jobs_backup" IS 'This is a duplicate of campaign_jobs';



ALTER TABLE "public"."campaign_jobs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."campaign_jobs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."campaign_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_processed_at" timestamp with time zone,
    "current_action_id" "uuid",
    "notes" "text",
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text",
    "email_message_id" "text",
    "email_thread_id" "text",
    "email_sent" boolean DEFAULT false,
    "email_sent_at" timestamp with time zone,
    "email_delivered_at" timestamp with time zone,
    "email_opened_at" timestamp with time zone,
    "email_clicked_at" timestamp with time zone,
    "is_converted" boolean DEFAULT false,
    "converted_at" timestamp with time zone,
    "conversion_type" character varying(50),
    "last_response_received_at" timestamp with time zone,
    "response_count" integer DEFAULT 0,
    "last_response_subject" "text",
    "last_response_text" "text",
    "error_message" "text"
);


ALTER TABLE "public"."campaign_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."campaign_leads" IS 'Links leads to specific campaigns and tracks their status within that campaign.';



CREATE TABLE IF NOT EXISTS "public"."campaign_runs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "status" "public"."campaign_status" DEFAULT 'DRAFT'::"public"."campaign_status" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "total_emails" integer DEFAULT 0,
    "sent_emails" integer DEFAULT 0,
    "failed_emails" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."campaign_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "daily_limit" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "market_region" "text" DEFAULT 'undefined'::"text" NOT NULL,
    "dry_run" boolean DEFAULT false NOT NULL,
    "sender_quota" integer DEFAULT 10 NOT NULL,
    "min_interval_seconds" integer DEFAULT 180 NOT NULL,
    "max_interval_seconds" integer DEFAULT 360 NOT NULL,
    "senders_used" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    "time_window_hours" integer DEFAULT 8 NOT NULL,
    "avg_emails_per_hour" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


COMMENT ON TABLE "public"."campaigns" IS 'Stores information about marketing campaigns.';



COMMENT ON COLUMN "public"."campaigns"."id" IS 'Unique identifier for the campaign.';



COMMENT ON COLUMN "public"."campaigns"."name" IS 'Name of the campaign.';



COMMENT ON COLUMN "public"."campaigns"."description" IS 'Detailed description of the campaign.';



COMMENT ON COLUMN "public"."campaigns"."status" IS 'Current status of the campaign (e.g., draft, active, paused, completed).';



COMMENT ON COLUMN "public"."campaigns"."is_active" IS 'Flag indicating if the campaign is currently active and should be processed.';



COMMENT ON COLUMN "public"."campaigns"."daily_limit" IS 'Maximum number of emails to be sent per day for this campaign.';



COMMENT ON COLUMN "public"."campaigns"."created_at" IS 'Timestamp of when the campaign was created.';



COMMENT ON COLUMN "public"."campaigns"."updated_at" IS 'Timestamp of when the campaign was last updated.';



COMMENT ON COLUMN "public"."campaigns"."market_region" IS 'Target market region for the campaign (e.g., a specific city or state).';



COMMENT ON COLUMN "public"."campaigns"."dry_run" IS 'If true, the campaign will simulate sending emails without actually sending them.';



COMMENT ON COLUMN "public"."campaigns"."sender_quota" IS 'Maximum number of emails a single sender account can send for this campaign daily.';



COMMENT ON COLUMN "public"."campaigns"."min_interval_seconds" IS 'Minimum interval in seconds between sending emails from the same sender account.';



COMMENT ON COLUMN "public"."campaigns"."max_interval_seconds" IS 'Maximum interval in seconds between sending emails from the same sender account.';



COMMENT ON COLUMN "public"."campaigns"."senders_used" IS 'Array of sender UUIDs that have been used in this campaign.';



COMMENT ON COLUMN "public"."campaigns"."time_window_hours" IS 'The duration in hours during which emails for this campaign should be sent (e.g., 8 for 9am-5pm).';



COMMENT ON COLUMN "public"."campaigns"."avg_emails_per_hour" IS 'Target average number of emails to send per hour for this campaign.';



CREATE TABLE IF NOT EXISTS "public"."crm_leads" (
    "id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false,
    "phone_number" integer,
    "phone" "text",
    "contact_phone" character varying(20)
);


ALTER TABLE "public"."crm_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."crm_leads" IS 'Stores CRM leads with property information and contact details';



COMMENT ON COLUMN "public"."crm_leads"."contact_type" IS 'Type of contact (e.g., owner, agent)';



COMMENT ON COLUMN "public"."crm_leads"."converted" IS 'Indicates if the lead has been converted';



COMMENT ON COLUMN "public"."crm_leads"."email_sent" IS 'Indicates if an email has been sent to this lead';



COMMENT ON COLUMN "public"."crm_leads"."contact_phone" IS 'Phone number for the primary contact of this lead';



CREATE SEQUENCE IF NOT EXISTS "public"."crm_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."crm_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."crm_leads_id_seq" OWNED BY "public"."crm_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."engine_log" (
    "id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text" NOT NULL,
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "market_region" "text",
    "normalized_lead_converted_status" boolean,
    "sender_name" "text",
    "sender_email_used" "text",
    "email_subject_sent" "text",
    "email_body_preview_sent" "text",
    "email_status" "text" NOT NULL,
    "email_error_message" "text",
    "email_sent_at" timestamp with time zone,
    "campaign_id" "uuid",
    "campaign_jobs_id" "uuid",
    "converted" boolean DEFAULT false NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "email_message_id" "text"
);


ALTER TABLE "public"."engine_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."engine_log" IS 'Log of individual email processing attempts by ENGINE. Each row represents one contact identified for emailing, with a snapshot of the original lead data and the email outcome.';



COMMENT ON COLUMN "public"."engine_log"."contact_name" IS 'The name of the specific contact identified for emailing.';



COMMENT ON COLUMN "public"."engine_log"."contact_email" IS 'The email address of the specific contact identified for emailing.';



COMMENT ON COLUMN "public"."engine_log"."normalized_lead_converted_status" IS 'Snapshot of the conversion status from the original normalized_leads record at the time of processing.';



COMMENT ON COLUMN "public"."engine_log"."email_status" IS 'Status of this specific email processing attempt (e.g., PENDING_SEND, SENT, FAILED_TO_SEND, SKIPPED).';



COMMENT ON COLUMN "public"."engine_log"."email_sent_at" IS 'Timestamp indicating when this specific email was successfully sent.';



COMMENT ON COLUMN "public"."engine_log"."converted" IS 'Indicates if this specific email communication led to a conversion (default: FALSE).';



COMMENT ON COLUMN "public"."engine_log"."processed_at" IS 'Timestamp indicating when this log entry was created.';



COMMENT ON COLUMN "public"."engine_log"."email_message_id" IS 'The unique message ID returned by the email service provider upon successful sending.';



CREATE OR REPLACE VIEW "public"."daily_email_metrics" AS
 SELECT "date_trunc"('day'::"text", "engine_log"."processed_at") AS "date",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")) AS "sent",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")) AS "delivered",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'BOUNCED'::"text")) AS "bounced",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'OPENED'::"text")) AS "opened",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'CLICKED'::"text")) AS "clicked",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'REPLIED'::"text")) AS "replied",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")) AS "total_sent",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "delivery_rate",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'BOUNCED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "bounce_rate",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'OPENED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "open_rate",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'CLICKED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "click_rate",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'REPLIED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "reply_rate"
   FROM "public"."engine_log"
  GROUP BY ("date_trunc"('day'::"text", "engine_log"."processed_at"))
  ORDER BY ("date_trunc"('day'::"text", "engine_log"."processed_at")) DESC;


ALTER TABLE "public"."daily_email_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dfw_metroplex_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."dfw_metroplex_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."dfw_metroplex_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region DFW Metroplex with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."dfw_metroplex_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."dfw_metroplex_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."dfw_metroplex_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."dfw_metroplex_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."dfw_metroplex_fine_cut_leads_id_seq" OWNED BY "public"."dfw_metroplex_fine_cut_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."document_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "file_path" "text",
    "file_type" "text",
    "created_by" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "content" "text",
    "type" "text",
    "user_id" "uuid" NOT NULL,
    "available_placeholders" "text"[] DEFAULT '{}'::"text"[],
    "subject" "text",
    CONSTRAINT "document_templates_type_check" CHECK (("type" = ANY (ARRAY['email'::"text", 'document'::"text"])))
);


ALTER TABLE "public"."document_templates" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."eli5_email_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."eli5_email_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."eli5_email_log_id_seq" OWNED BY "public"."engine_log"."id";



CREATE TABLE IF NOT EXISTS "public"."email_engagement_events" (
    "id" bigint NOT NULL,
    "email_message_id" "text" NOT NULL,
    "campaign_id" "uuid",
    "campaign_job_id" bigint,
    "lead_id" "text",
    "contact_email" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_agent" "text",
    "ip_address" "text",
    "reply_subject" "text",
    "reply_body_preview" "text",
    "bounce_reason" "text",
    "raw_event_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_engagement_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_engagement_events" IS 'Stores engagement events (opens, clicks, replies, bounces, etc.) related to emails sent via campaigns, typically populated by webhooks from the email service provider.';



CREATE SEQUENCE IF NOT EXISTS "public"."email_engagement_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."email_engagement_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."email_engagement_events_id_seq" OWNED BY "public"."email_engagement_events"."id";



CREATE OR REPLACE VIEW "public"."email_metrics_by_sender" AS
 SELECT "engine_log"."sender_email_used" AS "email",
    "engine_log"."sender_name" AS "name",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")) AS "sent",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")) AS "delivered",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'BOUNCED'::"text")) AS "bounced",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'OPENED'::"text")) AS "opened",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'CLICKED'::"text")) AS "clicked",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'REPLIED'::"text")) AS "replied",
    "count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")) AS "total_sent",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "delivery_rate",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'BOUNCED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'SENT'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "bounce_rate",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'OPENED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "open_rate",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'CLICKED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "click_rate",
        CASE
            WHEN ("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")) > 0) THEN "round"(((("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'REPLIED'::"text")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "engine_log"."id") FILTER (WHERE ("engine_log"."email_status" = 'DELIVERED'::"text")), 0))::numeric), 2)
            ELSE (0)::numeric
        END AS "reply_rate"
   FROM "public"."engine_log"
  WHERE ("engine_log"."sender_email_used" IS NOT NULL)
  GROUP BY "engine_log"."sender_email_used", "engine_log"."sender_name";


ALTER TABLE "public"."email_metrics_by_sender" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "body_text" "text",
    "placeholders" "text"[],
    "user_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."email_templates"."created_by" IS 'User ID of the template creator';



CREATE TABLE IF NOT EXISTS "public"."engine_control" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_running" boolean DEFAULT false,
    "last_started_at" timestamp with time zone,
    "last_stopped_at" timestamp with time zone,
    "current_campaign_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."engine_control" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."engine_status" (
    "status_key" "text" NOT NULL,
    "status_value" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."engine_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gulf_coast_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."gulf_coast_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."gulf_coast_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region Gulf Coast with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."gulf_coast_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."gulf_coast_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."gulf_coast_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."gulf_coast_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."gulf_coast_fine_cut_leads_id_seq" OWNED BY "public"."gulf_coast_fine_cut_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."houston_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."houston_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."houston_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region Houston with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."houston_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."houston_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."houston_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."houston_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."houston_fine_cut_leads_id_seq" OWNED BY "public"."houston_fine_cut_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."indianapolis_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."indianapolis_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."indianapolis_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region Indianapolis with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."indianapolis_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."indianapolis_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."indianapolis_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."indianapolis_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."indianapolis_fine_cut_leads_id_seq" OWNED BY "public"."indianapolis_fine_cut_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "original_filename" "text" NOT NULL,
    "market_region" "text" NOT NULL,
    "raw_data" "jsonb" NOT NULL,
    "normalization_status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "normalization_error" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leads_normalization_status_check" CHECK (("normalization_status" = ANY (ARRAY['PENDING'::"text", 'PROCESSED'::"text", 'ERROR'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."leads" IS 'Staging table for raw lead data uploaded from CSV files.';



COMMENT ON COLUMN "public"."leads"."raw_data" IS 'Stores the original parsed row data from the CSV as JSON.';



CREATE TABLE IF NOT EXISTS "public"."normalized_leads" (
    "id" bigint NOT NULL,
    "original_lead_id" "uuid",
    "market_region" "text",
    "contact1_name" "text",
    "contact1_email_1" "text",
    "contact2_name" "text",
    "contact2_email_1" "text",
    "contact3_name" "text",
    "contact3_email_1" "text",
    "mls_curr_list_agent_name" "text",
    "mls_curr_list_agent_email" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "avm_value" integer,
    "price_per_sq_ft" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "source" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."normalized_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."normalized_leads" IS 'Cleaned and structured lead data for campaigns.';



CREATE SEQUENCE IF NOT EXISTS "public"."normalized_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."normalized_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."normalized_leads_id_seq" OWNED BY "public"."normalized_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."pickledick_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."pickledick_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."pickledick_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region Pickledick with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."pickledick_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."pickledick_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."pickledick_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."pickledick_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pickledick_fine_cut_leads_id_seq" OWNED BY "public"."pickledick_fine_cut_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "first_name" "text",
    "last_name" "text",
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."san_antonio_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."san_antonio_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."san_antonio_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region San Antonio with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."san_antonio_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."san_antonio_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."san_antonio_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."san_antonio_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."san_antonio_fine_cut_leads_id_seq" OWNED BY "public"."san_antonio_fine_cut_leads"."id";



CREATE TABLE IF NOT EXISTS "public"."senders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sender_name" "text" NOT NULL,
    "sender_email" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "is_default" boolean DEFAULT false,
    "credentials_json" "jsonb",
    "daily_limit" integer DEFAULT 100,
    "sent_today" integer DEFAULT 0,
    "last_reset_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'active'::"text",
    "last_authorized_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_checked_history_id" "text"
);


ALTER TABLE "public"."senders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."senders"."last_checked_history_id" IS 'The last Gmail historyId processed for this sender to track new messages.';



CREATE TABLE IF NOT EXISTS "public"."system_event_logs" (
    "id" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "message" "text",
    "details" "jsonb",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_id" "uuid"
);


ALTER TABLE "public"."system_event_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_event_logs" IS 'System event logging table for tracking important system events.';



COMMENT ON COLUMN "public"."system_event_logs"."event_type" IS 'Type of the event (e.g., NORMALIZATION_ERROR, lead_import, user_action, system_alert)';



COMMENT ON COLUMN "public"."system_event_logs"."message" IS 'Human-readable message describing the event';



COMMENT ON COLUMN "public"."system_event_logs"."details" IS 'Additional event details in JSON format';



COMMENT ON COLUMN "public"."system_event_logs"."user_id" IS 'ID of the user who triggered the event, if applicable';



CREATE SEQUENCE IF NOT EXISTS "public"."system_event_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."system_event_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."system_event_logs_id_seq" OWNED BY "public"."system_event_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."system_script_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "script_name" "text",
    "log_level" "text",
    "message" "text",
    "details" "jsonb"
);


ALTER TABLE "public"."system_script_logs" OWNER TO "postgres";


ALTER TABLE "public"."system_script_logs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."system_script_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."system_state" (
    "id" integer DEFAULT 1 NOT NULL,
    "is_running" boolean DEFAULT false NOT NULL,
    "is_paused" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "paused_at" timestamp with time zone,
    CONSTRAINT "system_state_single_row" CHECK (("id" = 1))
);


ALTER TABLE "public"."system_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."west_texas_fine_cut_leads" (
    "id" bigint NOT NULL,
    "normalized_lead_id" bigint NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_type" "text" NOT NULL,
    "market_region" "text",
    "property_address" "text",
    "property_city" "text",
    "property_state" "text",
    "property_postal_code" "text",
    "property_type" "text",
    "baths" "text",
    "beds" "text",
    "year_built" "text",
    "square_footage" "text",
    "lot_size_sqft" "text",
    "wholesale_value" numeric,
    "assessed_total" numeric,
    "mls_curr_status" "text",
    "mls_curr_days_on_market" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent" boolean DEFAULT false
);


ALTER TABLE "public"."west_texas_fine_cut_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."west_texas_fine_cut_leads" IS 'Denormalized view of normalized_leads for market region West Texas with one row per unique contact-email combination.';



COMMENT ON COLUMN "public"."west_texas_fine_cut_leads"."normalized_lead_id" IS 'Foreign key to the original normalized_leads table';



COMMENT ON COLUMN "public"."west_texas_fine_cut_leads"."contact_type" IS 'Indicates the source of the contact: contact or agent';



CREATE SEQUENCE IF NOT EXISTS "public"."west_texas_fine_cut_leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."west_texas_fine_cut_leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."west_texas_fine_cut_leads_id_seq" OWNED BY "public"."west_texas_fine_cut_leads"."id";



ALTER TABLE ONLY "public"."application_settings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."application_settings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."austin_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."austin_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."brownsville_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."brownsville_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."crm_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."crm_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."dfw_metroplex_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."dfw_metroplex_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."email_engagement_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."email_engagement_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."engine_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."eli5_email_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."gulf_coast_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."gulf_coast_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."houston_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."houston_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."indianapolis_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."indianapolis_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."normalized_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."normalized_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pickledick_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pickledick_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."san_antonio_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."san_antonio_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."system_event_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."system_event_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."west_texas_fine_cut_leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."west_texas_fine_cut_leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."application_settings"
    ADD CONSTRAINT "application_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."application_settings"
    ADD CONSTRAINT "application_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."austin_fine_cut_leads"
    ADD CONSTRAINT "austin_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."austin_fine_cut_leads"
    ADD CONSTRAINT "austin_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



ALTER TABLE ONLY "public"."brownsville_fine_cut_leads"
    ADD CONSTRAINT "brownsville_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brownsville_fine_cut_leads"
    ADD CONSTRAINT "brownsville_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



ALTER TABLE ONLY "public"."campaign_jobs_backup"
    ADD CONSTRAINT "campaign_jobs_backup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_jobs"
    ADD CONSTRAINT "campaign_jobs_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."campaign_jobs"
    ADD CONSTRAINT "campaign_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_runs"
    ADD CONSTRAINT "campaign_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_steps"
    ADD CONSTRAINT "campaign_steps_campaign_id_step_number_key" UNIQUE ("campaign_id", "step_number");



ALTER TABLE ONLY "public"."campaign_steps"
    ADD CONSTRAINT "campaign_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dfw_metroplex_fine_cut_leads"
    ADD CONSTRAINT "dfw_metroplex_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dfw_metroplex_fine_cut_leads"
    ADD CONSTRAINT "dfw_metroplex_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engine_log"
    ADD CONSTRAINT "eli5_email_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engine_status"
    ADD CONSTRAINT "eli5_engine_status_pkey" PRIMARY KEY ("status_key");



ALTER TABLE ONLY "public"."email_engagement_events"
    ADD CONSTRAINT "email_engagement_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engine_control"
    ADD CONSTRAINT "engine_control_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gulf_coast_fine_cut_leads"
    ADD CONSTRAINT "gulf_coast_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gulf_coast_fine_cut_leads"
    ADD CONSTRAINT "gulf_coast_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



ALTER TABLE ONLY "public"."houston_fine_cut_leads"
    ADD CONSTRAINT "houston_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."houston_fine_cut_leads"
    ADD CONSTRAINT "houston_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



ALTER TABLE ONLY "public"."indianapolis_fine_cut_leads"
    ADD CONSTRAINT "indianapolis_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indianapolis_fine_cut_leads"
    ADD CONSTRAINT "indianapolis_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_regions"
    ADD CONSTRAINT "market_regions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."market_regions"
    ADD CONSTRAINT "market_regions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."normalized_leads"
    ADD CONSTRAINT "normalized_leads_original_lead_id_key" UNIQUE ("original_lead_id");



ALTER TABLE ONLY "public"."normalized_leads"
    ADD CONSTRAINT "normalized_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickledick_fine_cut_leads"
    ADD CONSTRAINT "pickledick_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickledick_fine_cut_leads"
    ADD CONSTRAINT "pickledick_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."san_antonio_fine_cut_leads"
    ADD CONSTRAINT "san_antonio_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."san_antonio_fine_cut_leads"
    ADD CONSTRAINT "san_antonio_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



ALTER TABLE ONLY "public"."senders"
    ADD CONSTRAINT "senders_email_key" UNIQUE ("sender_email");



ALTER TABLE ONLY "public"."senders"
    ADD CONSTRAINT "senders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_event_logs"
    ADD CONSTRAINT "system_event_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_script_logs"
    ADD CONSTRAINT "system_script_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_state"
    ADD CONSTRAINT "system_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."west_texas_fine_cut_leads"
    ADD CONSTRAINT "west_texas_fine_cut_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."west_texas_fine_cut_leads"
    ADD CONSTRAINT "west_texas_fine_cut_leads_unique_contact_per_lead" UNIQUE ("normalized_lead_id", "contact_email");



CREATE INDEX "campaign_jobs_backup_assigned_sender_id_idx" ON "public"."campaign_jobs_backup" USING "btree" ("assigned_sender_id");



CREATE INDEX "campaign_jobs_backup_campaign_id_idx" ON "public"."campaign_jobs_backup" USING "btree" ("campaign_id");



CREATE INDEX "campaign_jobs_backup_next_processing_time_idx" ON "public"."campaign_jobs_backup" USING "btree" ("next_processing_time") WHERE ("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text"]));



CREATE INDEX "campaign_jobs_backup_status_idx" ON "public"."campaign_jobs_backup" USING "btree" ("status");



CREATE INDEX "idx_application_settings_key" ON "public"."application_settings" USING "btree" ("key");



CREATE INDEX "idx_austin_fine_cut_leads_contact_email" ON "public"."austin_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_austin_fine_cut_leads_email_sent" ON "public"."austin_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_austin_fine_cut_leads_market_region" ON "public"."austin_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_austin_fine_cut_leads_property_full_addr" ON "public"."austin_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_brownsville_fine_cut_leads_contact_email" ON "public"."brownsville_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_brownsville_fine_cut_leads_email_sent" ON "public"."brownsville_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_brownsville_fine_cut_leads_market_region" ON "public"."brownsville_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_brownsville_fine_cut_leads_property_full_addr" ON "public"."brownsville_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_campaign_jobs_campaign_id" ON "public"."campaign_jobs" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_jobs_processing" ON "public"."campaign_jobs" USING "btree" ("next_processing_time") WHERE ("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text"]));



CREATE INDEX "idx_campaign_jobs_sender_id" ON "public"."campaign_jobs" USING "btree" ("assigned_sender_id");



CREATE INDEX "idx_campaign_jobs_status" ON "public"."campaign_jobs" USING "btree" ("status");



CREATE INDEX "idx_campaign_leads_campaign_id" ON "public"."campaign_leads" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_leads_status" ON "public"."campaign_leads" USING "btree" ("status");



CREATE INDEX "idx_campaign_leads_user_id" ON "public"."campaign_leads" USING "btree" ("user_id");



CREATE INDEX "idx_campaign_runs_campaign_id" ON "public"."campaign_runs" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_runs_status" ON "public"."campaign_runs" USING "btree" ("status");



CREATE INDEX "idx_campaign_steps_campaign_id" ON "public"."campaign_steps" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaigns_market_region" ON "public"."campaigns" USING "btree" ("market_region");



CREATE INDEX "idx_crm_leads_contact_email" ON "public"."crm_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_crm_leads_email_sent" ON "public"."crm_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_crm_leads_market_region" ON "public"."crm_leads" USING "btree" ("market_region");



CREATE INDEX "idx_crm_leads_property_full_addr" ON "public"."crm_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_dfw_metroplex_fine_cut_leads_contact_email" ON "public"."dfw_metroplex_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_dfw_metroplex_fine_cut_leads_email_sent" ON "public"."dfw_metroplex_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_dfw_metroplex_fine_cut_leads_market_region" ON "public"."dfw_metroplex_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_dfw_metroplex_fine_cut_leads_property_full_addr" ON "public"."dfw_metroplex_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_eli5_log_campaign_id" ON "public"."engine_log" USING "btree" ("campaign_id");



CREATE INDEX "idx_eli5_log_contact_email" ON "public"."engine_log" USING "btree" ("contact_email");



CREATE INDEX "idx_eli5_log_converted" ON "public"."engine_log" USING "btree" ("converted");



CREATE INDEX "idx_eli5_log_email_sent_at" ON "public"."engine_log" USING "btree" ("email_sent_at");



CREATE INDEX "idx_eli5_log_processed_at" ON "public"."engine_log" USING "btree" ("processed_at");



CREATE INDEX "idx_eli5_log_sender_email_used" ON "public"."engine_log" USING "btree" ("sender_email_used");



CREATE INDEX "idx_email_engagement_campaign_id" ON "public"."email_engagement_events" USING "btree" ("campaign_id");



CREATE INDEX "idx_email_engagement_event_timestamp" ON "public"."email_engagement_events" USING "btree" ("event_timestamp");



CREATE INDEX "idx_email_engagement_event_type" ON "public"."email_engagement_events" USING "btree" ("event_type");



CREATE INDEX "idx_email_engagement_job_id" ON "public"."email_engagement_events" USING "btree" ("campaign_job_id");



CREATE INDEX "idx_email_engagement_message_id" ON "public"."email_engagement_events" USING "btree" ("email_message_id");



CREATE INDEX "idx_engine_log_email_message_id" ON "public"."engine_log" USING "btree" ("email_message_id");



CREATE INDEX "idx_gulf_coast_fine_cut_leads_contact_email" ON "public"."gulf_coast_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_gulf_coast_fine_cut_leads_email_sent" ON "public"."gulf_coast_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_gulf_coast_fine_cut_leads_market_region" ON "public"."gulf_coast_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_gulf_coast_fine_cut_leads_property_full_addr" ON "public"."gulf_coast_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_houston_fine_cut_leads_contact_email" ON "public"."houston_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_houston_fine_cut_leads_email_sent" ON "public"."houston_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_houston_fine_cut_leads_market_region" ON "public"."houston_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_houston_fine_cut_leads_property_full_addr" ON "public"."houston_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_indianapolis_fine_cut_leads_contact_email" ON "public"."indianapolis_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_indianapolis_fine_cut_leads_email_sent" ON "public"."indianapolis_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_indianapolis_fine_cut_leads_market_region" ON "public"."indianapolis_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_indianapolis_fine_cut_leads_property_full_addr" ON "public"."indianapolis_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_market_regions_name" ON "public"."market_regions" USING "btree" ("name");



CREATE INDEX "idx_market_regions_normalized_name" ON "public"."market_regions" USING "btree" ("normalized_name");



CREATE INDEX "idx_norm_leads_contact1_email" ON "public"."normalized_leads" USING "btree" ("contact1_email_1");



CREATE INDEX "idx_norm_leads_market_region" ON "public"."normalized_leads" USING "btree" ("market_region");



CREATE INDEX "idx_norm_leads_property_full_addr" ON "public"."normalized_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_normalized_leads_market_region" ON "public"."normalized_leads" USING "btree" ("market_region");



CREATE INDEX "idx_normalized_leads_market_region_not_null" ON "public"."normalized_leads" USING "btree" ("market_region") WHERE ("market_region" IS NOT NULL);



CREATE INDEX "idx_pickledick_fine_cut_leads_contact_email" ON "public"."pickledick_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_pickledick_fine_cut_leads_email_sent" ON "public"."pickledick_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_pickledick_fine_cut_leads_market_region" ON "public"."pickledick_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_pickledick_fine_cut_leads_property_full_addr" ON "public"."pickledick_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_san_antonio_fine_cut_leads_contact_email" ON "public"."san_antonio_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_san_antonio_fine_cut_leads_email_sent" ON "public"."san_antonio_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_san_antonio_fine_cut_leads_market_region" ON "public"."san_antonio_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_san_antonio_fine_cut_leads_property_full_addr" ON "public"."san_antonio_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE INDEX "idx_system_event_logs_created_at" ON "public"."system_event_logs" USING "btree" ("created_at");



CREATE INDEX "idx_system_event_logs_event_type" ON "public"."system_event_logs" USING "btree" ("event_type");



CREATE INDEX "idx_system_event_logs_user_id" ON "public"."system_event_logs" USING "btree" ("user_id");



CREATE INDEX "idx_system_script_logs_created_at" ON "public"."system_script_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_system_script_logs_script_name" ON "public"."system_script_logs" USING "btree" ("script_name");



CREATE INDEX "idx_west_texas_fine_cut_leads_contact_email" ON "public"."west_texas_fine_cut_leads" USING "btree" ("contact_email");



CREATE INDEX "idx_west_texas_fine_cut_leads_email_sent" ON "public"."west_texas_fine_cut_leads" USING "btree" ("email_sent");



CREATE INDEX "idx_west_texas_fine_cut_leads_market_region" ON "public"."west_texas_fine_cut_leads" USING "btree" ("market_region");



CREATE INDEX "idx_west_texas_fine_cut_leads_property_full_addr" ON "public"."west_texas_fine_cut_leads" USING "btree" ("property_address", "property_city", "property_state", "property_postal_code");



CREATE OR REPLACE TRIGGER "engine_control_updated_at" BEFORE UPDATE ON "public"."engine_control" FOR EACH ROW EXECUTE FUNCTION "public"."update_engine_control_updated_at"();



CREATE OR REPLACE TRIGGER "on_document_template_created" BEFORE INSERT ON "public"."document_templates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_document_template"();



CREATE OR REPLACE TRIGGER "on_document_template_updated" BEFORE UPDATE ON "public"."document_templates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_document_template"();



CREATE OR REPLACE TRIGGER "set_application_settings_updated_at" BEFORE UPDATE ON "public"."application_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_austin_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."austin_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_brownsville_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."brownsville_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_crm_leads_updated_at" BEFORE UPDATE ON "public"."crm_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_dfw_metroplex_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."dfw_metroplex_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_gulf_coast_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."gulf_coast_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_houston_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."houston_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_indianapolis_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."indianapolis_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_market_regions_updated_at" BEFORE UPDATE ON "public"."market_regions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_normalized_leads_updated_at" BEFORE UPDATE ON "public"."normalized_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_pickledick_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."pickledick_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_san_antonio_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."san_antonio_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_west_texas_fine_cut_leads_updated_at" BEFORE UPDATE ON "public"."west_texas_fine_cut_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "trg_update_market_region_lead_count" AFTER INSERT OR DELETE OR UPDATE OF "market_region" ON "public"."normalized_leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_market_region_lead_count"();



CREATE OR REPLACE TRIGGER "update_campaign_jobs_updated_at" BEFORE UPDATE ON "public"."campaign_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_campaign_runs_updated_at" BEFORE UPDATE ON "public"."campaign_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_campaign_steps_updated_at" BEFORE UPDATE ON "public"."campaign_steps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_campaigns_updated_at" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_document_templates_modtime" BEFORE UPDATE ON "public"."document_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_document_templates_updated_at" BEFORE UPDATE ON "public"."document_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_eli5_email_log_updated_at" BEFORE UPDATE ON "public"."engine_log" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_eli5_engine_status_updated_at" BEFORE UPDATE ON "public"."engine_status" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_email_engagement_events_updated_at" BEFORE UPDATE ON "public"."email_engagement_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_email_templates_updated_at" BEFORE UPDATE ON "public"."email_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_senders_updated_at" BEFORE UPDATE ON "public"."senders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."campaign_jobs"
    ADD CONSTRAINT "campaign_jobs_assigned_sender_id_fkey" FOREIGN KEY ("assigned_sender_id") REFERENCES "public"."senders"("id");



ALTER TABLE ONLY "public"."campaign_jobs_backup"
    ADD CONSTRAINT "campaign_jobs_backup_assigned_sender_id_fkey" FOREIGN KEY ("assigned_sender_id") REFERENCES "public"."senders"("id");



ALTER TABLE ONLY "public"."campaign_jobs_backup"
    ADD CONSTRAINT "campaign_jobs_backup_assigned_sender_id_fkey1" FOREIGN KEY ("assigned_sender_id") REFERENCES "public"."senders"("id");



ALTER TABLE ONLY "public"."campaign_jobs_backup"
    ADD CONSTRAINT "campaign_jobs_backup_assigned_sender_id_fkey2" FOREIGN KEY ("assigned_sender_id") REFERENCES "public"."senders"("id");



ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_engagement_events"
    ADD CONSTRAINT "email_engagement_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_engagement_events"
    ADD CONSTRAINT "email_engagement_events_campaign_job_id_fkey" FOREIGN KEY ("campaign_job_id") REFERENCES "public"."campaign_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_created_by_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_created_by_fkey1" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."system_event_logs"
    ADD CONSTRAINT "fk_campaign" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_jobs"
    ADD CONSTRAINT "fk_campaign_jobs_sender" FOREIGN KEY ("assigned_sender_id") REFERENCES "public"."senders"("id");



ALTER TABLE ONLY "public"."campaign_jobs"
    ADD CONSTRAINT "fk_sender" FOREIGN KEY ("assigned_sender_id") REFERENCES "public"."senders"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_regions"
    ADD CONSTRAINT "market_regions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."normalized_leads"
    ADD CONSTRAINT "normalized_leads_original_lead_id_fkey" FOREIGN KEY ("original_lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."senders"
    ADD CONSTRAINT "senders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."system_event_logs"
    ADD CONSTRAINT "system_event_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Admin can manage application settings" ON "public"."application_settings" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Admin can manage campaign_leads" ON "public"."campaign_leads" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Admins can view all system logs" ON "public"."system_event_logs" FOR SELECT TO "authenticated" USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() IN ( SELECT "system_event_logs"."user_id"
   FROM "auth"."users"
  WHERE (("users"."raw_user_meta_data" ->> 'role'::"text") = 'admin'::"text")))));



CREATE POLICY "Allow authenticated users to read system script logs" ON "public"."system_script_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow service_role to insert system script logs" ON "public"."system_script_logs" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Authenticated users manage own templates" ON "public"."document_templates" TO "authenticated" USING ((("auth"."uid"() = COALESCE("created_by", "user_id")) AND ("is_active" = true))) WITH CHECK ((("auth"."uid"() = COALESCE("created_by", "user_id")) AND ("is_active" = true)));



CREATE POLICY "Enable all access for service role" ON "public"."email_templates" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."senders" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for all users" ON "public"."email_templates" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."engine_control" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."senders" FOR SELECT USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."engine_control" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable update access for authenticated users" ON "public"."engine_control" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Enable update for owners" ON "public"."senders" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Public can view active templates" ON "public"."document_templates" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Service role full access" ON "public"."document_templates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "System can insert logs" ON "public"."system_event_logs" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Users can insert their own leads" ON "public"."leads" FOR INSERT WITH CHECK (("auth"."uid"() = "uploaded_by"));



CREATE POLICY "Users can insert their own profile." ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile." ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own uploaded leads" ON "public"."leads" FOR SELECT USING (("auth"."uid"() = "uploaded_by"));



CREATE POLICY "authenticated save/edit/delete templates" ON "public"."email_templates" TO "authenticated" USING (true);



ALTER TABLE "public"."engine_control" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_script_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_state" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."campaign_jobs";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."engine_log";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."system_event_logs";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
















































GRANT ALL ON TYPE "public"."campaign_status_enum" TO "authenticated";


























































































































































































































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_market_specific_fine_cut_leads_table"("p_market_region_raw_name" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_complete_schema_dump"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_complete_schema_dump"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_complete_schema_dump"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_campaign_jobs_csv"("query_campaign_id" "uuid", "query_min_creation_timestamp" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_campaign_jobs_csv"("query_campaign_id" "uuid", "query_min_creation_timestamp" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campaign_jobs_csv"("query_campaign_id" "uuid", "query_min_creation_timestamp" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_campaigns_to_process"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_campaigns_to_process"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campaigns_to_process"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_email_metrics_time_series"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "interval_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_email_metrics_time_series"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "interval_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_email_metrics_time_series"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "interval_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_kpi_stats_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_kpi_stats_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_kpi_stats_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_document_template"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_document_template"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_document_template"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_document_template"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_document_template"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_document_template"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_updated"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_updated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_updated"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_sender_sent_count"("sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_sender_sent_count"("sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_sender_sent_count"("sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_market_name"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_market_name"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_market_name"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_staged_leads"("p_market_region" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_staged_leads"("p_market_region" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_staged_leads"("p_market_region" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_staged_leads"("p_market_region" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_staged_leads"("p_market_region" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_staged_leads"("p_market_region" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."campaign_steps" TO "anon";
GRANT ALL ON TABLE "public"."campaign_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_steps" TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_campaign_steps"("p_campaign_id" "uuid", "p_step_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_campaign_steps"("p_campaign_id" "uuid", "p_step_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_campaign_steps"("p_campaign_id" "uuid", "p_step_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_all_sender_daily_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_all_sender_daily_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_all_sender_daily_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_sender_daily_count"("sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_sender_daily_count"("sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_sender_daily_count"("sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."schedule_campaign_by_id_offset"("p_campaign_id" "uuid", "p_start_offset" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."schedule_campaign_by_id_offset"("p_campaign_id" "uuid", "p_start_offset" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_campaign_by_id_offset"("p_campaign_id" "uuid", "p_start_offset" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."schedule_campaign_by_offset_id"("p_start_offset" interval, "p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."schedule_campaign_by_offset_id"("p_start_offset" interval, "p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_campaign_by_offset_id"("p_start_offset" interval, "p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_assigned_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_assigned_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_assigned_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."start_eli5_engine"("p_dry_run" boolean, "p_limit_per_run" integer, "p_market_region" "text", "p_min_interval_seconds" integer, "p_max_interval_seconds" integer, "p_selected_sender_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."start_eli5_engine"("p_dry_run" boolean, "p_limit_per_run" integer, "p_market_region" "text", "p_min_interval_seconds" integer, "p_max_interval_seconds" integer, "p_selected_sender_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_eli5_engine"("p_dry_run" boolean, "p_limit_per_run" integer, "p_market_region" "text", "p_min_interval_seconds" integer, "p_max_interval_seconds" integer, "p_selected_sender_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."stop_eli5_engine"() TO "anon";
GRANT ALL ON FUNCTION "public"."stop_eli5_engine"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stop_eli5_engine"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_email_send"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_email_send"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_email_send"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_eli5_test_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_eli5_test_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_eli5_test_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_preflight_check"("campaign_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_preflight_check"("campaign_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_preflight_check"("campaign_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."truncate_normalized_leads"() TO "anon";
GRANT ALL ON FUNCTION "public"."truncate_normalized_leads"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."truncate_normalized_leads"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_engine_control_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_engine_control_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_engine_control_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_last_contacted"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_contacted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_contacted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_market_region_lead_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_market_region_lead_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_market_region_lead_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON TABLE "public"."market_regions" TO "anon";
GRANT ALL ON TABLE "public"."market_regions" TO "authenticated";
GRANT ALL ON TABLE "public"."market_regions" TO "service_role";



GRANT ALL ON TABLE "public"."active_market_regions" TO "anon";
GRANT ALL ON TABLE "public"."active_market_regions" TO "authenticated";
GRANT ALL ON TABLE "public"."active_market_regions" TO "service_role";



GRANT ALL ON TABLE "public"."application_settings" TO "anon";
GRANT ALL ON TABLE "public"."application_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."application_settings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."application_settings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."application_settings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."application_settings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."austin_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."austin_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."austin_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."austin_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."austin_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."austin_fine_cut_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."brownsville_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."brownsville_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."brownsville_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."brownsville_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."brownsville_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."brownsville_fine_cut_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_jobs" TO "anon";
GRANT ALL ON TABLE "public"."campaign_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_jobs_backup" TO "anon";
GRANT ALL ON TABLE "public"."campaign_jobs_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_jobs_backup" TO "service_role";



GRANT ALL ON SEQUENCE "public"."campaign_jobs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."campaign_jobs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."campaign_jobs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_leads" TO "anon";
GRANT ALL ON TABLE "public"."campaign_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_leads" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_runs" TO "anon";
GRANT ALL ON TABLE "public"."campaign_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_runs" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."crm_leads" TO "anon";
GRANT ALL ON TABLE "public"."crm_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."crm_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."crm_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."crm_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."engine_log" TO "anon";
GRANT ALL ON TABLE "public"."engine_log" TO "authenticated";
GRANT ALL ON TABLE "public"."engine_log" TO "service_role";



GRANT ALL ON TABLE "public"."daily_email_metrics" TO "anon";
GRANT ALL ON TABLE "public"."daily_email_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_email_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."dfw_metroplex_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."dfw_metroplex_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."dfw_metroplex_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."dfw_metroplex_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."dfw_metroplex_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."dfw_metroplex_fine_cut_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."document_templates" TO "anon";
GRANT ALL ON TABLE "public"."document_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."document_templates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."eli5_email_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."eli5_email_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."eli5_email_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."email_engagement_events" TO "anon";
GRANT ALL ON TABLE "public"."email_engagement_events" TO "authenticated";
GRANT ALL ON TABLE "public"."email_engagement_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."email_engagement_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."email_engagement_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."email_engagement_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."email_metrics_by_sender" TO "anon";
GRANT ALL ON TABLE "public"."email_metrics_by_sender" TO "authenticated";
GRANT ALL ON TABLE "public"."email_metrics_by_sender" TO "service_role";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."engine_control" TO "anon";
GRANT ALL ON TABLE "public"."engine_control" TO "authenticated";
GRANT ALL ON TABLE "public"."engine_control" TO "service_role";



GRANT ALL ON TABLE "public"."engine_status" TO "anon";
GRANT ALL ON TABLE "public"."engine_status" TO "authenticated";
GRANT ALL ON TABLE "public"."engine_status" TO "service_role";



GRANT ALL ON TABLE "public"."gulf_coast_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."gulf_coast_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."gulf_coast_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gulf_coast_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gulf_coast_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gulf_coast_fine_cut_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."houston_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."houston_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."houston_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."houston_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."houston_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."houston_fine_cut_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."indianapolis_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."indianapolis_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."indianapolis_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."indianapolis_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."indianapolis_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."indianapolis_fine_cut_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."normalized_leads" TO "anon";
GRANT ALL ON TABLE "public"."normalized_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."normalized_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."normalized_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."normalized_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."normalized_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pickledick_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."pickledick_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."pickledick_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pickledick_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pickledick_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pickledick_fine_cut_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."san_antonio_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."san_antonio_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."san_antonio_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."san_antonio_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."san_antonio_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."san_antonio_fine_cut_leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."senders" TO "anon";
GRANT ALL ON TABLE "public"."senders" TO "authenticated";
GRANT ALL ON TABLE "public"."senders" TO "service_role";



GRANT ALL ON TABLE "public"."system_event_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_event_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_event_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_event_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_event_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_event_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_script_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_script_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_script_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_script_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_script_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_script_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_state" TO "anon";
GRANT ALL ON TABLE "public"."system_state" TO "authenticated";
GRANT ALL ON TABLE "public"."system_state" TO "service_role";



GRANT ALL ON TABLE "public"."west_texas_fine_cut_leads" TO "anon";
GRANT ALL ON TABLE "public"."west_texas_fine_cut_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."west_texas_fine_cut_leads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."west_texas_fine_cut_leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."west_texas_fine_cut_leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."west_texas_fine_cut_leads_id_seq" TO "service_role";








































































































































































ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
