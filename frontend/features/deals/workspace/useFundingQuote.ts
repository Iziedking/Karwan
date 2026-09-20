'use client';
import { useCallback } from 'react';
import { api, type DirectDealFundingQuote } from '@/core/api';

/// Loads the funding quote the fund confirm sheet authorizes. Split out of
/// useWorkspaceActions so that file stays about the sheet and confirm flow,
/// not about this one request.
export function useFundingQuote(jobId: string) {
  const load = useCallback(async (address: string): Promise<DirectDealFundingQuote | null> => {
    try {
      const { quote } = await api.directDealFundingQuote(jobId, address);
      return quote;
    } catch {
      return null;
    }
  }, [jobId]);

  return { load };
}
