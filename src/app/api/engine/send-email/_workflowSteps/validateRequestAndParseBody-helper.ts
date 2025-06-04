// src/app/api/engine/test-email/workflow/validateRequestAndParseBody-helper.ts
import { NextRequest } from 'next/server';

import { createAdminServerClient } from '@/lib/supabase/server';

import type { RequestPayload } from './_types'; // Adjusted path

export async function validateRequestAndParseBody(request: NextRequest): Promise<{
  marketRegionNormalizedName: string;
  sendPdf: boolean;
  sendToLead: boolean;
  specificLeadIdToTest?: string;
  campaignId?: string;
  supabase: ReturnType<typeof createAdminServerClient>;
}> {
  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    throw new Error('Invalid JSON in request body');
  }

  const {
    marketRegionNormalizedName,
    leadId: specificLeadIdToTest, 
    sendPdf = true, 
    sendToLead = false, 
    campaignId,
  } = requestBody as RequestPayload; 

  const validationErrors: string[] = [];

  if (!marketRegionNormalizedName || typeof marketRegionNormalizedName !== 'string' || marketRegionNormalizedName.trim() === '') {
    validationErrors.push('marketRegionNormalizedName is required and must be a non-empty string.');
  }
  if (typeof sendPdf !== 'boolean') {
    validationErrors.push('sendPdf must be a boolean.');
  }
  if (typeof sendToLead !== 'boolean') {
    validationErrors.push('sendToLead must be a boolean.');
  }
  if (specificLeadIdToTest !== undefined && (typeof specificLeadIdToTest !== 'string' || specificLeadIdToTest.trim() === '')) {
    validationErrors.push('specificLeadIdToTest must be a non-empty string if provided.');
  }
  if (campaignId !== undefined && (typeof campaignId !== 'string' || campaignId.trim() === '')) {
    validationErrors.push('campaignId must be a non-empty string if provided.');
  }

  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join('; ')}`);
  }

  const supabase = createAdminServerClient();
  return {
    marketRegionNormalizedName: marketRegionNormalizedName.trim(),
    sendPdf,
    sendToLead,
    specificLeadIdToTest: specificLeadIdToTest?.trim(),
    campaignId: campaignId?.trim(),
    supabase,
  };
}
