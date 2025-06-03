import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableStructure() {
  try {
    // Check if the table exists
    const { data: tableExists, error: tableCheckError } = await supabase
      .rpc('table_exists', { table_name: 'eli5_email_log' });
    
    if (tableCheckError) throw tableCheckError;
    
    if (!tableExists) {
      console.log('Table eli5_email_log does not exist in the database.');
      return;
    }
    
    // Get table structure
    const { data: columns, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'eli5_email_log');
    
    if (error) throw error;
    
    console.log('Table eli5_email_log structure:');
    console.table(columns);
    
  } catch (error) {
    console.error('Error checking table structure:', error);
  }
}

checkTableStructure();
