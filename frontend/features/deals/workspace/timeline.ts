import type { DealView } from '@/core/api';
import type { CheckStatus } from './checkStatus';

export type TimelineKind = 'label' | 'working' | 'deliver' | 'checking';

export interface TimelineRow {
  step: DealView['progress'][number]['step'];
  state: DealView['progress'][number]['state'];
  kind: TimelineKind;
  at?: number;
  dueAt?: number;
}

/// The deal's steps as a dated list. Done steps keep when they happened; the
/// current step says whose move it is, and a running delivery check is shown
/// as it happens instead of a silent wait.
export function timelineRows(
  progress: DealView['progress'],
  ctx: { viewerIsBuyer: boolean; check: CheckStatus | null; dueAt: number | null },
): TimelineRow[] {
  return progress.map((p) => {
    let kind: TimelineKind = 'label';
    if (p.state === 'current' && p.step === 'delivered') kind = ctx.viewerIsBuyer ? 'working' : 'deliver';
    if (p.state === 'current' && p.step === 'checked' && ctx.check === 'checking') kind = 'checking';
    return {
      step: p.step,
      state: p.state,
      kind,
      ...(p.at != null ? { at: p.at } : {}),
      ...(kind === 'working' || kind === 'deliver') && ctx.dueAt != null ? { dueAt: ctx.dueAt } : {},
    };
  });
}

export function latestLines<T extends { ts: number }>(messages: readonly T[], count = 3): T[] {
  return [...messages].sort((a, b) => b.ts - a.ts).slice(0, count);
}
