// Script to check if eli5_email_log table exists and its structure
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function checkTableExistence() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Check if the table exists by querying information_schema
    const { data: tableExists, error: tableError } = await supabase.rpc('table_exists', { 
      table_name: 'eli5_email_log' 
    });
    
    if (tableError) {
      console.error('Error checking if table exists:', tableError);
      return;
    }
    
    if (!tableExists) {
      console.log('Table eli5_email_log does not exist in the database.');
      return;
    }
    
    console.log('Table eli5_email_log exists. Checking structure...');
    
    // Get column information
    const { data: columns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'eli5_email_log');
    
    if (columnError) {
      console.error('Error getting column information:', columnError);
      return;
    }
    
    console.log('\nTable structure:');
    console.table(columns);
    
    // Try to get a sample row if the table has data
    const { data: sampleData, error: sampleError } = await supabase
      .from('eli5_email_log')
      .select('*')
      .limit(1);
    
    if (sampleError) {
      console.error('Error getting sample data:', sampleError);
      return;
    }
    
    if (sampleData && sampleData.length > 0) {
      console.log('\nSample row data:');
      console.log(JSON.stringify(sampleData[0], null, 2));
    } else {
      console.log('\nTable is empty.');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkTableExistence();
