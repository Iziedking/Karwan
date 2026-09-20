import type { DealView, DirectDeal } from '@/core/api';

/// What the confirm sheet saw when the buyer or seller opened it. Confirm
/// refuses to send an action the viewer never actually looked at: a refetch
/// while the sheet is open can move the deal (a milestone claimed elsewhere,
/// the seller editing terms) out from under the confirmation the person is
/// about to give.
export interface ConfirmSnapshot {
  agreementVersion: number | null;
  agreementDigest: string | null;
  nextAction: DealView['next']['action'];
  milestonesReleased: number | null;
}

export function snapshotDeal(deal: DirectDeal): ConfirmSnapshot {
  return {
    agreementVersion: deal.agreementVersion ?? null,
    agreementDigest: deal.agreementDigest ?? null,
    nextAction: deal.view?.next.action ?? null,
    milestonesReleased: deal.onChain?.milestonesReleased ?? null,
  };
}

/// True once the live deal has moved past what the snapshot captured. Any of
/// the three drifting is enough: the milestone check catches a release/claim
/// that already happened, the action check catches the deal moving to a
/// different stage entirely, and the digest check catches an edited
/// agreement, all while the sheet sat open.
export function dealMovedSinceSnapshot(snapshot: ConfirmSnapshot, deal: DirectDeal): boolean {
  const live = snapshotDeal(deal);
  return (
    live.nextAction !== snapshot.nextAction ||
    live.milestonesReleased !== snapshot.milestonesReleased ||
    live.agreementDigest !== snapshot.agreementDigest
  );
}

export type ConfirmErrorKind = 'agreement-changed' | 'quote-changed' | 'insufficient-balance' | 'silent' | 'message';

/// How a failed confirm should read to the user. A dropped connection or a
/// server crash (status 0 or 5xx) is never distinguishable from "it actually
/// went through"; the money line after a refresh is the only honest answer,
/// so those read as 'silent' rather than 'failed'. A written 4xx message is
/// the server telling the user something real and is shown as-is.
export function classifyConfirmError(input: { status?: number; code?: string }): ConfirmErrorKind {
  if (input.code === 'AGREEMENT_CHANGED') return 'agreement-changed';
  if (input.code === 'QUOTE_CHANGED') return 'quote-changed';
  if (input.code === 'INSUFFICIENT_AGENT_BALANCE' || input.code === 'INSUFFICIENT_STAKE') return 'insufficient-balance';
  if (input.status === 0 || (typeof input.status === 'number' && input.status >= 500)) return 'silent';
  return 'message';
}
