-- Create a function to get time series data for email metrics
CREATE OR REPLACE FUNCTION public.get_email_metrics_time_series(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  interval_days INTEGER DEFAULT 1
)
RETURNS TABLE (
  date_group DATE,
  sent BIGINT,
  delivered BIGINT,
  bounced BIGINT,
  opened BIGINT,
  clicked BIGINT,
  replied BIGINT
)
LANGUAGE sql
SECURITY DEFINER
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

-- Create a view for email metrics by sender
CREATE OR REPLACE VIEW public.email_metrics_by_sender AS
SELECT 
  sender_email_used AS email,
  sender_name AS name,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT') AS sent,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') AS delivered,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'BOUNCED') AS bounced,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'OPENED') AS opened,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'CLICKED') AS clicked,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'REPLIED') AS replied,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT') AS total_sent,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT'), 0), 2)
    ELSE 0 
  END AS delivery_rate,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'BOUNCED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT'), 0), 2)
    ELSE 0 
  END AS bounce_rate,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'OPENED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED'), 0), 2)
    ELSE 0 
  END AS open_rate,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'CLICKED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED'), 0), 2)
    ELSE 0 
  END AS click_rate,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'REPLIED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED'), 0), 2)
    ELSE 0 
  END AS reply_rate
FROM 
  public.eli5_email_log
WHERE 
  sender_email_used IS NOT NULL
GROUP BY 
  sender_email_used, sender_name;

-- Create a view for daily email metrics
CREATE OR REPLACE VIEW public.daily_email_metrics AS
SELECT 
  date_trunc('day', processed_at) AS date,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT') AS sent,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') AS delivered,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'BOUNCED') AS bounced,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'OPENED') AS opened,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'CLICKED') AS clicked,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'REPLIED') AS replied,
  COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT') AS total_sent,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT'), 0), 2)
    ELSE 0 
  END AS delivery_rate,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'BOUNCED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'SENT'), 0), 2)
    ELSE 0 
  END AS bounce_rate,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'OPENED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED'), 0), 2)
    ELSE 0 
  END AS open_rate,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'CLICKED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED'), 0), 2)
    ELSE 0 
  END AS click_rate,
  CASE 
    WHEN COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED') > 0 
    THEN ROUND((COUNT(DISTINCT id) FILTER (WHERE email_status = 'REPLIED') * 100.0) / 
               NULLIF(COUNT(DISTINCT id) FILTER (WHERE email_status = 'DELIVERED'), 0), 2)
    ELSE 0 
  END AS reply_rate
FROM 
  public.eli5_email_log
GROUP BY 
  date_trunc('day', processed_at)
ORDER BY 
  date DESC;
