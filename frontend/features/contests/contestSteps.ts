import type { ContestView } from '@/core/api';
import type { TrackStep } from '@/features/deals/workspace/StepsTrack';

/// A contest on the deal page's steps (view 44): Prize in, Entries, Winners,
/// Paid out. A contest that ended without winners shows the prize going back.
export function contestSteps(c: ContestView, now: number): TrackStep[] {
  if (c.status === 'cancelled' || c.status === 'returned' || c.status === 'failed') {
    return [
      { key: 'prizeIn', state: 'done' },
      { key: 'cancelled', state: 'done' },
      { key: 'refunded', state: c.status === 'returned' ? 'done' : 'current' },
    ];
  }
  const done = [
    c.status !== 'opening',
    c.status === 'awarding' || c.status === 'awarded' || now >= c.entriesBy,
    c.status === 'awarded',
    c.status === 'awarded',
  ];
  const keys = ['prizeIn', 'entries', 'winners', 'paidOut'] as const;
  const current = done.indexOf(false);
  return keys.map((key, i) => ({ key, state: done[i] ? 'done' : i === current ? 'current' : 'upcoming' }));
}
