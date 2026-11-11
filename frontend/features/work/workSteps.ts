import type { WorkWeekView } from '@/core/api';
import type { TrackStep } from '@/features/deals/workspace/StepsTrack';

/// One week (or month) of hourly work on the deal page's steps (view 44):
/// Paid in, Hours sent, Paid out. A week exists once it is paid in. A month
/// counted in sessions (view 76) says Sessions held in the middle.
export function workSteps(week: WorkWeekView, bySession = false): TrackStep[] {
  const sent = week.status !== 'funded';
  const paid = week.status === 'settled';
  return [
    { key: 'paidIn', state: 'done' },
    { key: bySession ? 'sessionsHeld' : 'hoursSent', state: sent ? 'done' : 'current' },
    { key: 'paidOut', state: paid ? 'done' : sent ? 'current' : 'upcoming' },
  ];
}
