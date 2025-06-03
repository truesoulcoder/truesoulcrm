-- Create a function to increment the sent count for a sender
-- This will be called from the application code after a successful email send
CREATE OR REPLACE FUNCTION public.increment_sender_sent_count(sender_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
