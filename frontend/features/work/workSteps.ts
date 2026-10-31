import type { WorkWeekView } from '@/core/api';
import type { TrackStep } from '@/features/deals/workspace/StepsTrack';

/// One week (or month) of hourly work on the deal page's steps (view 44):
/// Paid in, Hours sent, Paid out. A week exists once it is paid in.
export function workSteps(week: WorkWeekView): TrackStep[] {
  const sent = week.status !== 'funded';
  const paid = week.status === 'settled';
  return [
    { key: 'paidIn', state: 'done' },
    { key: 'hoursSent', state: sent ? 'done' : 'current' },
    { key: 'paidOut', state: paid ? 'done' : sent ? 'current' : 'upcoming' },
  ];
}
