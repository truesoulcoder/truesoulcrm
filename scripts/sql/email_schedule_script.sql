-- Start a transaction to ensure data consistency
BEGIN;

-- First, check if the campaign exists
DO $$
DECLARE
    campaign_exists BOOLEAN;
    campaign_id_var UUID;
BEGIN
    -- Check if campaign exists
    SELECT EXISTS(SELECT 1 FROM campaigns WHERE name = 'Indy1000') INTO campaign_exists;
    
    -- If campaign doesn't exist, create it
    IF NOT campaign_exists THEN
        INSERT INTO campaigns (
            name,
            description,
            status,
            is_active,
            daily_limit,
            market_region,
            dry_run,
            sender_quota,
            min_interval_seconds,
            max_interval_seconds,
            created_at,
            updated_at
        ) VALUES (
            'Indy1000',
            'First scheduled campaign starting in Indianapolis with 1000 emails per day',
            'active',
            TRUE,
            1000,  -- daily limit
            'indianapolis',
            FALSE,  -- not a dry run
            100,    -- sender quota
            180,    -- min interval seconds (3 minutes)
            300,    -- max interval seconds (5 minutes)
            NOW(),
            NOW()
        ) RETURNING id INTO campaign_id_var;
    ELSE
        -- Update existing campaign
        UPDATE campaigns 
        SET 
            updated_at = NOW(),
            status = 'active',
            is_active = TRUE
        WHERE name = 'Indy1000'
        RETURNING id INTO campaign_id_var;
    END IF;
    
    -- Create a temporary table to store the campaign ID
    CREATE TEMP TABLE campaign_id AS SELECT campaign_id_var as id;
END $$;

-- Create a temporary table for selected leads
CREATE TEMP TABLE selected_leads AS
WITH available_leads AS (
    SELECT 
        id as lead_id,
        contact_name,
        contact_email,
        ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
    FROM indianapolis_fine_cut_leads
    WHERE email_sent IS NULL OR email_sent = FALSE
    LIMIT 1000
)
SELECT 
    lead_id,
    contact_name,
    contact_email,
    rn
FROM available_leads;

-- Create a temporary table for active senders with row numbers
CREATE TEMP TABLE active_senders AS
SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY id) as sender_num,
    COUNT(*) OVER () as total_senders
FROM senders 
WHERE is_active = TRUE;

-- Now continue with the rest of the script, using the campaign_id
WITH 
-- Calculate total time window (10 hours in seconds)
time_window AS (
    SELECT 10 * 60 * 60 as total_seconds
),
-- Generate a series of all seconds in the time window
all_seconds AS (
    SELECT generate_series(0, (SELECT total_seconds FROM time_window) - 1) as second_offset
),
-- Randomly select distinct seconds from the time window
selected_times AS (
    SELECT 
        second_offset,
        ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
    FROM all_seconds
    ORDER BY RANDOM()
    LIMIT (SELECT COUNT(*) FROM selected_leads)
),
-- Assign senders in a round-robin fashion to the selected times
scheduled_emails AS (
    SELECT
        sl.lead_id,
        sl.contact_name,
        sl.contact_email,
        NOW() + (st.second_offset * INTERVAL '1 second') as send_time,
        asnd.id as sender_id
    FROM 
        selected_leads sl
    JOIN 
        selected_times st ON sl.rn = st.rn
    JOIN
        active_senders asnd ON 
            asnd.sender_num = ((sl.rn - 1) % (SELECT total_senders FROM active_senders LIMIT 1)) + 1
)

-- Insert into campaign_jobs with completely randomized send times
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

-- Mark all selected leads as scheduled to be emailed
UPDATE indianapolis_fine_cut_leads
SET 
    email_sent = TRUE,
    updated_at = NOW()
WHERE id IN (
    SELECT lead_id FROM selected_leads
);

-- Log the scheduling
WITH stats AS (
    SELECT
        COUNT(*) as total_emails,
        MIN(next_processing_time) as first_send_time,
        MAX(next_processing_time) as last_send_time,
        COUNT(DISTINCT assigned_sender_id) as senders_used
    FROM campaign_jobs 
    WHERE status = 'pending'
    AND created_at >= NOW() - INTERVAL '5 minutes'  -- Only count jobs we just created
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
    'Scheduled ' || total_emails || ' emails for Indy1000 campaign with randomized send times over 10 hours',
    json_build_object(
        'campaign_name', 'Indy1000',
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

-- Log the distribution of emails per sender for monitoring
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
        AND created_at >= NOW() - INTERVAL '5 minutes'  -- Only count jobs we just created
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
    'Email distribution for sender ' || assigned_sender_id || ' in Indy1000 campaign',
    json_build_object(
        'campaign_name', 'Indy1000',
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

-- Clean up temporary tables
DROP TABLE IF EXISTS campaign_id;
DROP TABLE IF EXISTS selected_leads;
DROP TABLE IF EXISTS active_senders;

-- Commit the transaction
COMMIT;