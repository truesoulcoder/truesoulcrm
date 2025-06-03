-- SQL to check the structure of eli5_email_log table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'eli5_email_log';

-- Alternative: Get a sample row to see the column names and data
-- SELECT * FROM public.eli5_email_log LIMIT 1;
