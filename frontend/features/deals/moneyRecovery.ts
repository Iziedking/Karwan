import type { MoneyMovementView } from '@/core/api';

/**
 * A payout that needs attention may have reached the chain before the receipt
 * projection completed. The recovery route reconciles this exact movement
 * reference; the UI must not offer a fresh independent payout while it does.
 */
export function findUnresolvedPayoutRecovery(movements: MoneyMovementView[]): MoneyMovementView | undefined {
  return movements.find(
    (movement) => movement.kind === 'milestone_payout' && movement.state === 'needs_attention',
  );
}
