// Simple script to query the eli5_email_log table structure
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function checkTableStructure() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Get the first row to see the structure
    const { data, error } = await supabase
      .from('eli5_email_log')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error querying eli5_email_log:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('Sample row from eli5_email_log:');
      console.log(JSON.stringify(data[0], null, 2));
      
      // Get column names
      if (data[0]) {
        console.log('\nColumn names:');
        console.log(Object.keys(data[0]).join('\n'));
      }
    } else {
      console.log('No data found in eli5_email_log table');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

checkTableStructure();
