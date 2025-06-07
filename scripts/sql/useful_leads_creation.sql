-- First, drop the existing table if it exists to start fresh
DROP TABLE IF EXISTS public.useful_leads;

-- Create the useful_leads table with all columns from normalized_leads
-- but restructured for contacts
CREATE TABLE public.useful_leads (
    -- New primary key
    id BIGSERIAL PRIMARY KEY,
    -- Reference to the original normalized lead
    normalized_lead_id BIGINT NOT NULL,
    -- Contact information (replacing the multiple contact fields)
    contact_name TEXT,
    contact_email TEXT,
    contact_type TEXT NOT NULL, -- 'contact1', 'contact2', 'contact3', or 'agent'
    -- All other columns from normalized_leads
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
    -- Constraints
    CONSTRAINT fk_normalized_lead FOREIGN KEY (normalized_lead_id) 
        REFERENCES public.normalized_leads(id) ON DELETE CASCADE,
    -- Ensure we don't have duplicate contact entries for the same lead
    CONSTRAINT unique_contact_per_lead UNIQUE (normalized_lead_id, contact_email)
) TABLESPACE pg_default;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_useful_leads_contact_email 
    ON public.useful_leads(contact_email) 
    TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_useful_leads_market_region 
    ON public.useful_leads(market_region) 
    TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_useful_leads_property_full_addr 
    ON public.useful_leads(property_address, property_city, property_state, property_postal_code) 
    TABLESPACE pg_default;

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_useful_leads_updated_at
BEFORE UPDATE ON useful_leads
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Now populate the table with data from normalized_leads
-- First, create a temporary table to hold all potential contacts
WITH all_contacts AS (
    -- Contact 1
    SELECT 
        id,
        contact1_name AS contact_name,
        LOWER(TRIM(contact1_email_1)) AS contact_email,
        'contact1' AS contact_type,
        original_lead_id,
        market_region,
        property_address,
        property_city,
        property_state,
        property_postal_code,
        property_type,
        baths,
        beds,
        year_built,
        square_footage,
        lot_size_sqft,
        wholesale_value,
        assessed_total,
        avm_value,
        price_per_sq_ft,
        mls_curr_status,
        mls_curr_days_on_market,
        converted,
        status,
        source,
        notes,
        created_at,
        updated_at,
        -- Priority: contact1 has highest priority
        1 AS priority
    FROM public.normalized_leads
    WHERE contact1_email_1 IS NOT NULL AND contact1_email_1 != ''

    UNION ALL

    -- Contact 2
    SELECT 
        id,
        contact2_name AS contact_name,
        LOWER(TRIM(contact2_email_1)) AS contact_email,
        'contact2' AS contact_type,
        original_lead_id,
        market_region,
        property_address,
        property_city,
        property_state,
        property_postal_code,
        property_type,
        baths,
        beds,
        year_built,
        square_footage,
        lot_size_sqft,
        wholesale_value,
        assessed_total,
        avm_value,
        price_per_sq_ft,
        mls_curr_status,
        mls_curr_days_on_market,
        converted,
        status,
        source,
        notes,
        created_at,
        updated_at,
        2 AS priority
    FROM public.normalized_leads
    WHERE contact2_email_1 IS NOT NULL AND contact2_email_1 != ''

    UNION ALL

    -- Contact 3
    SELECT 
        id,
        contact3_name AS contact_name,
        LOWER(TRIM(contact3_email_1)) AS contact_email,
        'contact3' AS contact_type,
        original_lead_id,
        market_region,
        property_address,
        property_city,
        property_state,
        property_postal_code,
        property_type,
        baths,
        beds,
        year_built,
        square_footage,
        lot_size_sqft,
        wholesale_value,
        assessed_total,
        avm_value,
        price_per_sq_ft,
        mls_curr_status,
        mls_curr_days_on_market,
        converted,
        status,
        source,
        notes,
        created_at,
        updated_at,
        3 AS priority
    FROM public.normalized_leads
    WHERE contact3_email_1 IS NOT NULL AND contact3_email_1 != ''

    UNION ALL

    -- Listing Agent
    SELECT 
        id,
        mls_curr_list_agent_name AS contact_name,
        LOWER(TRIM(mls_curr_list_agent_email)) AS contact_email,
        'agent' AS contact_type,
        original_lead_id,
        market_region,
        property_address,
        property_city,
        property_state,
        property_postal_code,
        property_type,
        baths,
        beds,
        year_built,
        square_footage,
        lot_size_sqft,
        wholesale_value,
        assessed_total,
        avm_value,
        price_per_sq_ft,
        mls_curr_status,
        mls_curr_days_on_market,
        converted,
        status,
        source,
        notes,
        created_at,
        updated_at,
        4 AS priority  -- Agent has lowest priority
    FROM public.normalized_leads
    WHERE mls_curr_list_agent_email IS NOT NULL AND mls_curr_list_agent_email != ''
),

-- Now deduplicate, keeping the highest priority record for each email per lead
deduplicated_contacts AS (
    SELECT DISTINCT ON (normalized_lead_id, contact_email)
        id AS normalized_lead_id,
        contact_name,
        contact_email,
        contact_type,
        original_lead_id,
        market_region,
        property_address,
        property_city,
        property_state,
        property_postal_code,
        property_type,
        baths,
        beds,
        year_built,
        square_footage,
        lot_size_sqft,
        wholesale_value,
        assessed_total,
        avm_value,
        price_per_sq_ft,
        mls_curr_status,
        mls_curr_days_on_market,
        converted,
        status,
        source,
        notes,
        created_at,
        updated_at,
        contact_type AS original_contact_type
    FROM all_contacts
    WHERE contact_email IS NOT NULL
    ORDER BY normalized_lead_id, contact_email, priority, 
        CASE 
            WHEN contact_name IS NOT NULL AND contact_name != '' THEN 0
            ELSE 1
        END
)

-- Now insert the deduplicated records
INSERT INTO public.useful_leads (
    normalized_lead_id,
    contact_name,
    contact_email,
    contact_type,
    original_lead_id,
    market_region,
    property_address,
    property_city,
    property_state,
    property_postal_code,
    property_type,
    baths,
    beds,
    year_built,
    square_footage,
    lot_size_sqft,
    wholesale_value,
    assessed_total,
    avm_value,
    price_per_sq_ft,
    mls_curr_status,
    mls_curr_days_on_market,
    converted,
    status,
    source,
    notes,
    created_at,
    updated_at
)
SELECT 
    normalized_lead_id,
    contact_name,
    contact_email,
    contact_type,
    original_lead_id,
    market_region,
    property_address,
    property_city,
    property_state,
    property_postal_code,
    property_type,
    baths,
    beds,
    year_built,
    square_footage,
    lot_size_sqft,
    wholesale_value,
    assessed_total,
    avm_value,
    price_per_sq_ft,
    mls_curr_status,
    mls_curr_days_on_market,
    converted,
    status,
    source,
    notes,
    created_at,
    updated_at
FROM deduplicated_contacts;

-- Add a comment to describe the table
COMMENT ON TABLE public.useful_leads IS 'Denormalized view of normalized_leads with one row per unique contact-email combination for easier querying and campaign management.';

-- Add comments to the key columns
COMMENT ON COLUMN public.useful_leads.contact_type IS 'Indicates the source of the contact: contact1, contact2, contact3, or agent';
COMMENT ON COLUMN public.useful_leads.normalized_lead_id IS 'Foreign key to the original normalized_leads table';

-- Add email_sent column if it doesn't exist
ALTER TABLE public.useful_leads 
ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;

-- Add an index for better performance
CREATE INDEX IF NOT EXISTS idx_useful_leads_email_sent 
ON public.useful_leads(email_sent) 
TABLESPACE pg_default;