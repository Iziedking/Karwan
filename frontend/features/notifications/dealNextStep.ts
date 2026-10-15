import type { DealStage } from '@/features/deals/components/DirectDealList';
import type { Messages } from '@/shared/i18n/messages';

type PendingChips = Messages['pending']['chips'];

/// The move each live stage waits for, and whether the buyer makes it. A stage
/// missing here is finished, so nobody owes a move.
const NEXT: Partial<Record<DealStage, { action: keyof PendingChips; buyerActs: boolean }>> = {
  'awaiting-acceptance': { action: 'agreeTerms', buyerActs: false },
  'awaiting-funding': { action: 'reviewFunding', buyerActs: true },
  'awaiting-delivery': { action: 'markDelivered', buyerActs: false },
  'awaiting-first-release': { action: 'releaseFirst', buyerActs: true },
  'awaiting-final-release': { action: 'releaseFinal', buyerActs: true },
};

/// True when the viewer must act next on a deal at this stage.
export function isYourMove(stage: DealStage, isBuyer: boolean): boolean {
  const next = NEXT[stage];
  return !!next && next.buyerActs === isBuyer;
}

/// Chip label for a deal stage from the viewer's side: either an action this
/// viewer owns or a wait on the counterparty. Null on terminal stages so
/// finished deals do not render here.
export function labelFor(
  stage: DealStage,
  isBuyer: boolean,
  chips: PendingChips,
): { kind: 'action' | 'wait'; text: string } | null {
  const next = NEXT[stage];
  if (!next) return null;
  if (next.buyerActs === isBuyer) return { kind: 'action', text: chips[next.action] };
  return { kind: 'wait', text: next.buyerActs ? chips.waitingOnBuyer : chips.waitingOnSeller };
}
