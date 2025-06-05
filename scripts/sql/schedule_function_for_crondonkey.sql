-- Drop the function if it exists to avoid conflicts with return type changes
DROP FUNCTION IF EXISTS public.schedule_campaign_by_id_offset(uuid, interval);

-- Create the function
CREATE FUNCTION public.schedule_campaign_by_id_offset(p_campaign_id uuid, p_start_offset interval)
RETURNS TABLE(job_id BIGINT, next_processed_time TIMESTAMPTZ)
LANGUAGE plpgsql
AS $function$
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
$function$;