import type { EscrowAccount } from '../chain/contracts.js';
import type { MoneyMovement } from './model.js';

type FundingEscrow = Pick<
  EscrowAccount,
  'buyer' | 'seller' | 'dealAmount' | 'milestonePcts'
>;

export function fundingEscrowMatches(
  account: FundingEscrow,
  input: {
    buyerAgent: string;
    sellerAgent: string;
    dealAmount: bigint;
    milestonePcts: number[];
  },
): boolean {
  return (
    account.buyer.toLowerCase() === input.buyerAgent.toLowerCase() &&
    account.seller.toLowerCase() === input.sellerAgent.toLowerCase() &&
    account.dealAmount === input.dealAmount &&
    account.milestonePcts.length === input.milestonePcts.length &&
    account.milestonePcts.every((pct, index) => pct === input.milestonePcts[index])
  );
}

export function expectedMilestonePayout(
  account: Pick<EscrowAccount, 'sellerNet' | 'released' | 'milestonePcts'>,
  milestoneIndex: number,
): bigint {
  if (milestoneIndex < 0 || milestoneIndex >= account.milestonePcts.length) {
    throw new Error('milestone index is outside the escrow schedule');
  }
  const isFinal = milestoneIndex + 1 === account.milestonePcts.length;
  return isFinal
    ? account.sellerNet - account.released
    : (account.sellerNet * BigInt(account.milestonePcts[milestoneIndex]!)) / 100n;
}

/**
 * Returns the latest unfinished payout whose effect is already visible in the
 * escrow counter. A retry must reconcile this movement before it may create a
 * movement for the next counter value.
 */
export function findAdvancedUnfinishedPayout(
  movements: MoneyMovement[],
  milestonesReleased: number,
): MoneyMovement | undefined {
  return movements
    .filter(
      (movement) =>
        movement.kind === 'milestone_payout' &&
        movement.state !== 'completed' &&
        movement.state !== 'cancelled' &&
        movement.milestoneIndex != null &&
        milestonesReleased > movement.milestoneIndex,
    )
    .sort((a, b) => (b.milestoneIndex ?? -1) - (a.milestoneIndex ?? -1))[0];
}
