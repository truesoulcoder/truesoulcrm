// src/app/crm/actions.ts
"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

// Define shorter types for convenience based on the new schema
type Property = Tables<'properties'>;
type PropertyUpdate = TablesUpdate<'properties'>;

// Define a consistent server action response
interface ServerActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Updates a property record in the database.
 * @param propertyId The UUID of the property to update.
 * @param updatedPropertyData The data to update, e.g., { status: 'Contacted', notes: 'New note' }
 * @returns A response object indicating success or failure.
 */
export async function updatePropertyAction(
  propertyId: string,
  updatedPropertyData: PropertyUpdate
): Promise<ServerActionResponse<Property>> {
  const supabase = createClient();

  if (!propertyId) {
    return { success: false, error: 'Property ID is required for an update.' };
  }

  try {
    // The 'updated_at' field is handled automatically by the database trigger
    const { data, error } = await supabase
      .from('properties')
      .update(updatedPropertyData)
      .eq('property_id', propertyId)
      .select()
      .single();

    if (error) {
      console.error(`Error updating property with ID ${propertyId}:`, error);
      return { success: false, error: error.message };
    }

    revalidatePath('/crm'); // Invalidate the cache for the CRM page to show updated data
    return { success: true, data: data as Property };

  } catch (e: any) {
    console.error('Exception in updatePropertyAction:', e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}

/**
 * Deletes a property and its associated contacts from the database.
 * @param propertyId The UUID of the property to delete.
 * @returns A response object indicating success or failure.
 */
export async function deletePropertyAction(propertyId: string): Promise<ServerActionResponse<null>> {
  const supabase = createClient();

  if (!propertyId) {
    return { success: false, error: 'Property ID is required for deletion.' };
  }

  try {
    // Because the 'contacts' table has a cascading delete constraint,
    // deleting a property will automatically delete all of its associated contacts.
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('property_id', propertyId);

    if (error) {
      console.error(`Error deleting property with ID ${propertyId}:`, error);
      return { success: false, error: error.message };
    }

    revalidatePath('/crm');
    return { success: true, data: null };

  } catch (e: any) {
    console.error(`Exception in deletePropertyAction:`, e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}

// Note: The createCrmLeadAction is removed as creating a new property from the UI
// is a more complex flow that we can build out later. The primary focus now is
// on displaying and managing the leads from the CSV upload.