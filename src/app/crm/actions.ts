"use server";

import { revalidatePath } from 'next/cache';

import { Database } from '@/db_types';
import { createClient } from '@/lib/supabase/server';

import type { CrmLead } from '@/types/crm';

interface ServerActionResponse<T = CrmLead | CrmLead[] | null> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Helper function to get the correct table name from market region
function getLeadsTableName(marketRegion: string): keyof Database['public']['Tables'] {
  // Convert to lowercase and replace spaces with underscores
  const tableName = `${marketRegion.toLowerCase().replace(/\s+/g, '_')}_fine_cut_leads` as const;
  return tableName as keyof Database['public']['Tables'];
}

// Action to CREATE a new CRM lead
export async function createCrmLeadAction(newLeadData: Partial<Omit<CrmLead, 'id' | 'created_at' | 'updated_at'>>): Promise<ServerActionResponse<CrmLead>> {
  const supabase = createClient();
  console.log('Server Action createCrmLeadAction called with:', newLeadData);

  if (!newLeadData.contact_type) {
    return { success: false, error: 'Contact type is required.' };
  }

  if (!newLeadData.market_region) {
    return { success: false, error: 'Market region is required.' };
  }

  const tableName = getLeadsTableName(newLeadData.market_region);
  
  try {
    // First, get the next available ID
        // Get the next available ID
    let nextId = 1;
    // Use type assertion to handle dynamic table name
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data: maxIdData, error: maxIdError } = await (supabase as any)
      .from(tableName)
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    
    if (!maxIdError && maxIdData?.[0]?.id) {
      nextId = Number(maxIdData[0].id) + 1;
    }
    
    // Insert with the next ID
    const insertData = {
      ...newLeadData,
      first_name: newLeadData.first_name,
      last_name: newLeadData.last_name,
      status: newLeadData.status,
      street_address: newLeadData.street_address,
      // contact_name is no longer part of CrmLead, so it's not in newLeadData by type
      id: nextId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Use type assertion to handle dynamic table name
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data, error } = await (supabase as any)
      .from(tableName)
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error(`Error creating lead in ${tableName}:`, error);
      return { success: false, error: error.message };
    }

    if (data) {
      revalidatePath('/crm');
      return { 
        success: true, 
        data: { ...data, id: nextId } as CrmLead, 
        message: 'Lead created successfully.' 
      };
    }
    
    return { success: false, error: 'Failed to create lead or retrieve created data.' };

  } catch (e: any) {
    console.error(`Exception in createCrmLeadAction for table ${tableName}:`, e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}

// Action to UPDATE an existing CRM lead
export async function updateCrmLeadAction(leadId: number, updatedLeadData: Partial<Omit<CrmLead, 'id' | 'created_at'>>): Promise<ServerActionResponse<CrmLead>> {
  if (!updatedLeadData.market_region) {
    return { success: false, error: 'Market region is required for updating a lead.' };
  }
  
  const tableName = getLeadsTableName(updatedLeadData.market_region);
  const supabase = createClient();
  console.log(`Server Action updateCrmLeadAction called for ID ${leadId} with:`, updatedLeadData);

  if (!leadId) {
    return { success: false, error: 'Lead ID is required for an update.' };
  }

  try {
    const dataToUpdate = {
      ...updatedLeadData,
      first_name: updatedLeadData.first_name,
      last_name: updatedLeadData.last_name,
      status: updatedLeadData.status,
      street_address: updatedLeadData.street_address,
      // contact_name is no longer part of CrmLead, so it's not in updatedLeadData by type
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
    .from(tableName as keyof Database['public']['Tables']) // Type assertion to handle dynamic table name
    .update(dataToUpdate)
    .eq('id', leadId)
    .select()
    .single();

    if (error) {
      console.error(`Error updating lead in ${tableName}:`, error);
      return { success: false, error: error.message };
    }
    
    if (data) {
      revalidatePath('/crm'); // Revalidate the CRM page
      return { success: true, data: data as CrmLead, message: 'Lead updated successfully.' };
    }
    return { success: false, error: 'Failed to update lead or retrieve updated data.' };

  } catch (e: any) {
    console.error('Exception in updateCrmLeadAction:', e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}

// Action to DELETE a CRM lead
export async function deleteCrmLeadAction({ leadId, marketRegion }: { leadId: number; marketRegion: string }): Promise<ServerActionResponse<null>> {
  const supabase = createClient();
  console.log(`Server Action deleteCrmLeadAction called for ID: ${leadId} in market: ${marketRegion}`);

  if (!leadId) {
    return { success: false, error: 'Lead ID is required for deletion.' };
  }

  if (!marketRegion) {
    return { success: false, error: 'Market region is required for deletion.' };
  }

  const tableName = getLeadsTableName(marketRegion);

  try {
    // Use type assertion to handle dynamic table name
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { error } = await (supabase as any)
      .from(tableName)
      .delete()
      .eq('id', leadId);

    if (error) {
      console.error(`Error deleting lead in ${tableName}:`, error);
      return { success: false, error: error.message };
    }

    revalidatePath('/crm'); // Revalidate the CRM page (or specific market page if possible)
    return { success: true, message: `Lead deleted successfully from ${tableName}.` };

  } catch (e: any) {
    console.error(`Exception in deleteCrmLeadAction for table ${tableName}:`, e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}
