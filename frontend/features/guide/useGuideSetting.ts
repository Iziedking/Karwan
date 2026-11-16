'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type UserSettings } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { guideFrom, type GuideSetting } from './guideChoices';

export const settingsKey = (address: string | null) => ['settings', address] as const;

/// How Aman shows on this account (view 57). It reads the settings query the
/// rest of the site shares, and saving updates it at once.
export function useGuideSetting(): {
  guide: GuideSetting;
  loaded: boolean;
  set: (next: GuideSetting) => Promise<void>;
  /// The account's settings, for the other things Aman remembers (view 57, 15 Nov evening).
  settings: UserSettings | undefined;
  save: (patch: UserSettings) => Promise<void>;
} {
  const { address } = useAuth();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: settingsKey(address ?? null),
    queryFn: () => api.getSettings(address as string),
    enabled: !!address,
    staleTime: 5 * 60_000,
  });

  const save = useCallback(
    async (patch: UserSettings) => {
      if (!address) return;
      const key = settingsKey(address);
      const before = client.getQueryData<{ settings: UserSettings }>(key);
      client.setQueryData(key, { settings: { ...(before?.settings ?? {}), ...patch } });
      try {
        client.setQueryData(key, await api.saveSettings(address, patch));
      } catch {
        client.setQueryData(key, before);
      }
    },
    [address, client],
  );
  const set = useCallback((next: GuideSetting) => save({ guide: next }), [save]);

  return { guide: guideFrom(settings.data?.settings), loaded: settings.isSuccess || settings.isError, set, settings: settings.data?.settings, save };
}
