-- Create a function to reset daily send counts for all senders
-- This can be called from a scheduled job or manually when needed
CREATE OR REPLACE FUNCTION public.reset_all_sender_daily_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create a function to reset daily send counts for a specific sender
CREATE OR REPLACE FUNCTION public.reset_sender_daily_count(sender_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
