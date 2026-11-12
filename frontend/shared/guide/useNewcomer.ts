'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useAuth } from '@/shared/hooks/useAuth';
import { whoIsThis, type Who } from './newcomer';

/// The same two reads, under the same keys, that every signed-in page already
/// makes (useUserProfile, useDirectDeals), so a tour costs no read of its own.
export function useNewcomer(): Who {
  const auth = useAuth();
  const address = auth.address;
  const enabled = auth.isAuthenticated && !!address;
  const profile = useQuery({
    queryKey: qk.profile.me(address),
    queryFn: () => api.getProfile(address!).then((r) => r.profile),
    enabled,
    staleTime: 60_000,
  });
  const deals = useQuery({
    queryKey: qk.deals.list(address),
    queryFn: () => api.directDeals(address!).then((r) => r.deals),
    enabled,
    staleTime: 30_000,
  });
  return whoIsThis(
    {
      deals: deals.isSuccess ? deals.data.length : null,
      profileRead: profile.isSuccess,
      setupDoneAt: profile.data?.settings?.setupDoneAt,
    },
    Date.now(),
  );
}
