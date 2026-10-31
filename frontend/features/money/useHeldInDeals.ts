'use client';
import { useAuth } from '@/shared/hooks/useAuth';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { heldInDeals } from './heldInDeals';

/// What Karwan holds in the signed-in person's deals as the buyer, or null
/// while the deals load (view 44, P7).
export function useHeldInDeals(): string | null {
  const { address } = useAuth();
  const direct = useDirectDeals();
  return address && direct.fetchState === 'success' ? heldInDeals(direct.deals, address) : null;
}
