// supabase/functions/_shared/cors.ts
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Or for better security: process.env.SUPABASE_URL
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };