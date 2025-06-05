// src/app/api/engine/test-email/workflow/determineMarketDetails-helper.ts
import { logSystemEvent } from '@/services/logService';

export async function determineMarketDetails(
  marketRegionNormalizedName: string,
  campaignId?: string
): Promise<{ leadTableName: string; normalizedMarketRegionName: string }> {
  const trimmedMarketRegionName = marketRegionNormalizedName.trim();
  if (!trimmedMarketRegionName) {
    await logSystemEvent({
      event_type: 'ENGINE_SETUP_ERROR',
      message: 'Market region normalized name is empty or invalid for determining lead table.',
      details: { marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    throw new Error('Market region normalized name is required to determine lead table.');
  }
  // Ensure the market region part of the table name is lowercase
  const leadTableName = `${trimmedMarketRegionName.toLowerCase()}_fine_cut_leads`;
  return {
    leadTableName,
    // Keep original trimmedMarketRegionName for normalizedMarketRegionName, 
    // as its casing might be relevant for other purposes (e.g. display or non-DB logic).
    // The critical fix is for leadTableName.
    normalizedMarketRegionName: trimmedMarketRegionName, 
  };
}