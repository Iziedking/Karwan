import type { api } from '@/core/api';

export type RecordRead = Awaited<ReturnType<typeof api.record>>;
type Rating = NonNullable<RecordRead['rating']>;

export type OwnRecord =
  | { kind: 'new' }
  | { kind: 'record'; completed: number; onTimePct: number | null; problemsLost: number; rating: Rating | null };

/// Your record on Profile (view 44, P9). Your own counts are yours to see;
/// others only ever see words (publicRecord). Null while it loads.
export function ownRecord(data: RecordRead | undefined): OwnRecord | null {
  if (!data) return null;
  const counts = data.counts;
  if (!counts || counts.completed === 0) return { kind: 'new' };
  return {
    kind: 'record',
    completed: counts.completed,
    // The record read already rounds it to a percent (recordRead.ts).
    onTimePct: counts.onTimeRate === null ? null : Math.round(counts.onTimeRate),
    problemsLost: counts.disputesLost,
    rating: data.rating ?? null,
  };
}
