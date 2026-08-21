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

/// The whole seller payout schedule of an escrow, in USDC micros, one entry per
/// milestone. Same arithmetic as KarwanEscrow._payMilestone: a percentage of
/// sellerNet for every milestone but the last, and the remainder for the last so
/// integer division can never leave dust locked in the contract.
///
/// `expectedMilestonePayout` answers "what does the NEXT release pay" and needs
/// the live `released` counter to do it, which makes it useless for a settled
/// escrow (released == sellerNet, so the final milestone reads as zero). This
/// answers "what did milestone N pay" for any milestone at any time, which is
/// what a receipt written after the fact needs.
export function milestonePayoutSchedule(
  account: Pick<EscrowAccount, 'sellerNet' | 'milestonePcts'>,
): bigint[] {
  const amounts: bigint[] = [];
  let paid = 0n;
  for (let index = 0; index < account.milestonePcts.length; index++) {
    const isFinal = index === account.milestonePcts.length - 1;
    const amount = isFinal
      ? account.sellerNet - paid
      : (account.sellerNet * BigInt(account.milestonePcts[index]!)) / 100n;
    amounts.push(amount);
    paid += amount;
  }
  return amounts;
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
