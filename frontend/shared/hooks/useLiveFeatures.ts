'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { LIVE_FEATURES_OFF, LIVE_FEATURES_QUERY, type LiveFeatures } from '@/shared/liveFeatures';

export function useLiveFeatures(): LiveFeatures {
  const { data } = useQuery({ queryKey: ['live-features'], queryFn: api.features, ...LIVE_FEATURES_QUERY });
  return data ?? LIVE_FEATURES_OFF;
}
