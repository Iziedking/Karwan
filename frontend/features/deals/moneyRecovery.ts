import type { MoneyMovementView } from '@/core/api';

/**
 * A payout that needs attention may have reached the chain before the receipt
 * projection completed. The deal release route reconciles the same movement
 * reference; the UI must not offer a fresh independent payout while it does.
 */
export function hasUnresolvedPayoutRecovery(movements: MoneyMovementView[]): boolean {
  return movements.some(
    (movement) => movement.kind === 'milestone_payout' && movement.state === 'needs_attention',
  );
}
