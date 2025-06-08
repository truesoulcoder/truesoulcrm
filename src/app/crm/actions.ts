// src/app/crm/actions.ts
"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types';

// Define shorter types for convenience based on the new schema
type Lead = Database['public']['Tables']['leads']['Row'];
type LeadInsert = Database['public']['Tables']['leads']['Insert'];
type LeadUpdate = Database['public']['Tables']['leads']['Update'];

interface ServerActionResponse<T = Lead | Lead[] | null> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Action to CREATE a new lead in the unified 'leads' table
export async function createCrmLeadAction(newLeadData: LeadInsert): Promise<ServerActionResponse<Lead>> {
  const supabase = createClient();
  
  // Get the authenticated user's ID to associate with the new lead
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'User not authenticated.' };
  }

  // Ensure the user_id is set correctly
  const dataToInsert: LeadInsert = {
    ...newLeadData,
    user_id: user.id, 
  };

  try {
    const { data, error } = await supabase
      .from('leads')
      .insert(dataToInsert)
      .select()
      .single();

    if (error) {
      console.error(`Error creating lead:`, error);
      // Handle unique constraint violation gracefully
      if (error.code === '23505') { // unique_violation
        return { success: false, error: 'A lead with this email already exists.' };
      }
      return { success: false, error: error.message };
    }

    if (data) {
      revalidatePath('/crm');
      return { 
        success: true, 
        data: data as Lead, 
        message: 'Lead created successfully.' 
      };
    }
    
    return { success: false, error: 'Failed to create lead or retrieve created data.' };

  } catch (e: any) {
    console.error(`Exception in createCrmLeadAction:`, e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}

// Action to UPDATE an existing lead in the unified 'leads' table
export async function updateCrmLeadAction(leadId: string, updatedLeadData: LeadUpdate): Promise<ServerActionResponse<Lead>> {
  const supabase = createClient();

  if (!leadId) {
    return { success: false, error: 'Lead ID is required for an update.' };
  }

  try {
    // The 'updated_at' field is now handled automatically by the database trigger 'handle_lead_update'
    const dataToUpdate: LeadUpdate = {
      ...updatedLeadData,
    };

    const { data, error } = await supabase
      .from('leads')
      .update(dataToUpdate)
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      console.error(`Error updating lead with ID ${leadId}:`, error);
      return { success: false, error: error.message };
    }
    
    if (data) {
      revalidatePath('/crm');
      return { success: true, data: data as Lead, message: 'Lead updated successfully.' };
    }

    return { success: false, error: 'Failed to update lead or retrieve updated data.' };

  } catch (e: any) {
    console.error('Exception in updateCrmLeadAction:', e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}

// Action to DELETE a lead from the unified 'leads' table
export async function deleteCrmLeadAction(leadId: string): Promise<ServerActionResponse<null>> {
  const supabase = createClient();

  if (!leadId) {
    return { success: false, error: 'Lead ID is required for deletion.' };
  }

  try {
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      console.error(`Error deleting lead with ID ${leadId}:`, error);
      return { success: false, error: error.message };
    }

    revalidatePath('/crm');
    return { success: true, message: 'Lead deleted successfully.' };

  } catch (e: any) {
    console.error(`Exception in deleteCrmLeadAction:`, e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}