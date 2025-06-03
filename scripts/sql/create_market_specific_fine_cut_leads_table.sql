
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
                original_lead_id UUID,
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
                avm_value INTEGER,
                price_per_sq_ft NUMERIC,
                mls_curr_status TEXT,
                mls_curr_days_on_market TEXT,
                converted BOOLEAN NOT NULL DEFAULT FALSE,
                status TEXT,
                source TEXT,
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
                    id, contact1_name AS contact_name, LOWER(TRIM(contact1_email_1)) AS contact_email, ''contact1'' AS contact_type,
                    original_lead_id, market_region, property_address, property_city, property_state, property_postal_code, property_type,
                    baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft,
                    mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at, 1 AS priority
                FROM public.normalized_leads WHERE contact1_email_1 IS NOT NULL AND contact1_email_1 != ''''
                UNION ALL
                SELECT 
                    id, contact2_name AS contact_name, LOWER(TRIM(contact2_email_1)) AS contact_email, ''contact2'' AS contact_type,
                    original_lead_id, market_region, property_address, property_city, property_state, property_postal_code, property_type,
                    baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft,
                    mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at, 2 AS priority
                FROM public.normalized_leads WHERE contact2_email_1 IS NOT NULL AND contact2_email_1 != ''''
                UNION ALL
                SELECT 
                    id, contact3_name AS contact_name, LOWER(TRIM(contact3_email_1)) AS contact_email, ''contact3'' AS contact_type,
                    original_lead_id, market_region, property_address, property_city, property_state, property_postal_code, property_type,
                    baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft,
                    mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at, 3 AS priority
                FROM public.normalized_leads WHERE contact3_email_1 IS NOT NULL AND contact3_email_1 != ''''
                UNION ALL
                SELECT 
                    id, mls_curr_list_agent_name AS contact_name, LOWER(TRIM(mls_curr_list_agent_email)) AS contact_email, ''agent'' AS contact_type,
                    original_lead_id, market_region, property_address, property_city, property_state, property_postal_code, property_type,
                    baths, beds, year_built, square_footage, lot_size_sqft, wholesale_value, assessed_total, avm_value, price_per_sq_ft,
                    mls_curr_status, mls_curr_days_on_market, converted, status, source, notes, created_at, updated_at, 4 AS priority
                FROM public.normalized_leads WHERE mls_curr_list_agent_email IS NOT NULL AND mls_curr_list_agent_email != ''''
            ),
            deduplicated_contacts AS (
                SELECT DISTINCT ON (normalized_lead_id, contact_email)
                    id AS normalized_lead_id, contact_name, contact_email, contact_type, original_lead_id, market_region, property_address, property_city,
                    property_state, property_postal_code, property_type, baths, beds, year_built, square_footage, lot_size_sqft,
                    wholesale_value, assessed_total, avm_value, price_per_sq_ft, mls_curr_status, mls_curr_days_on_market,
                    converted, status, source, notes, created_at, updated_at
                FROM all_contacts
                WHERE contact_email IS NOT NULL
                ORDER BY normalized_lead_id, contact_email, priority, 
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
            v_table_name -- %I for the target table in INSERT INTO
        );
        EXECUTE v_sql_command;

        -- 7. Table and Column Comments
        EXECUTE format('COMMENT ON TABLE public.%I IS %L;', v_table_name, 'Denormalized view of normalized_leads for market region ' || p_market_region_raw_name || ' with one row per unique contact-email combination.');
        EXECUTE format('COMMENT ON COLUMN public.%I.contact_type IS %L;', v_table_name, 'Indicates the source of the contact: contact1, contact2, contact3, or agent');
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

END;
