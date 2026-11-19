import type { DealView } from '@/core/api';

/// The one mark beside the money line (view 92): Your turn when the person must
/// act, Held while Karwan holds the money, nothing once the deal is over or
/// before any money is in.
export function sealFor(view: DealView): 'turn' | 'held' | null {
  if (view.stage === 'settled' || view.stage === 'cancelled') return null;
  if (view.next.actor === 'you') return 'turn';
  if (view.money.line === 'held' || view.money.line === 'paused') return 'held';
  return null;
}
