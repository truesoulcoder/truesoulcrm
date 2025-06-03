-- Update the trigger_eli5_test_email function
CREATE OR REPLACE FUNCTION public.trigger_eli5_test_email()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
