import type { DirectDeal } from '@/core/api';

export type WorldCheckRole = 'buyer' | 'seller';
export type WorldCheckOverviewState = 'verified' | 'waiting' | 'unavailable' | 'rejected' | 'pending';

export function worldCheckOverview(
  deal: DirectDeal,
  viewerRole: WorldCheckRole | null,
): { visible: boolean; actionable: boolean; state: WorldCheckOverviewState } {
  if (deal.verificationPolicy !== 'high_signal') {
    return { visible: false, actionable: false, state: 'pending' };
  }

  const requiredRoles: WorldCheckRole[] = deal.verificationSubject === 'both'
    ? ['buyer', 'seller']
    : [deal.verificationSubject ?? 'seller'];
  const statuses = requiredRoles.map(
    (role) => deal.highSignalVerification?.[role]?.status ?? 'pending',
  );

  if (statuses.every((status) => status === 'verified')) {
    return { visible: true, actionable: false, state: 'verified' };
  }

  if (!viewerRole || !requiredRoles.includes(viewerRole)) {
    return { visible: true, actionable: false, state: 'waiting' };
  }

  const viewerStatus = deal.highSignalVerification?.[viewerRole]?.status ?? 'pending';
  if (viewerStatus === 'verified') {
    return { visible: true, actionable: false, state: 'waiting' };
  }
  if (viewerStatus === 'unavailable') {
    return { visible: true, actionable: false, state: 'unavailable' };
  }
  if (viewerStatus === 'rejected') {
    return { visible: true, actionable: true, state: 'rejected' };
  }
  return { visible: true, actionable: true, state: 'pending' };
}
