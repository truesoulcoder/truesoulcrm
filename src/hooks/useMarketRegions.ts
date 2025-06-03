'use client';

import { useState, useEffect, useCallback } from 'react';

import { Database } from '@/db_types';
import { supabase } from '@/lib/supabase/client';

type MarketRegion = Database['public']['Tables']['market_regions']['Row'];

export function useMarketRegions(): {
  marketRegions: MarketRegion[];
  selectedMarketRegion: string | null;
  setSelectedMarketRegion: (region: string | null) => void;
  loading: boolean;
  fetchMarketRegions: () => Promise<void>;
} {
  const [marketRegions, setMarketRegions] = useState<MarketRegion[]>([]);
  const [selectedMarketRegion, setSelectedMarketRegion] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchMarketRegions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: sbError } = await supabase
        .from('market_regions')
        .select('*')
        .order('name', { ascending: true });

      if (sbError) throw sbError;

      if (data?.length) {
        setMarketRegions(data);
        if (!selectedMarketRegion) {
          setSelectedMarketRegion(data[0]?.name || null);
        }
      }
    } catch (err) {
      console.error(handleError(err));
    } finally {
      setLoading(false);
    }
  }, [selectedMarketRegion]);

  useEffect(() => {
    void fetchMarketRegions();
  }, [fetchMarketRegions]);

  return {
    marketRegions,
    selectedMarketRegion,
    setSelectedMarketRegion,
    loading,
    fetchMarketRegions,
  };
}

function handleError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}