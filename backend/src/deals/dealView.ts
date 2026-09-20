/// What the deal page, emails and the assistant show about one deal, computed
/// once on the server so no two surfaces can disagree. Pure: every input is a
/// field of the enriched deal plus the viewer's side, whether a money movement
/// is still in flight, and the clock.

export type DealStage =
  | 'awaiting-acceptance'
  | 'awaiting-funding'
  | 'awaiting-delivery'
  | 'awaiting-first-release'
  | 'awaiting-final-release'
  | 'settled'
  | 'cancelled'
  | 'disputed';
export type MoneyLine = 'not-funded' | 'held' | 'sending' | 'paused' | 'released' | 'refunding' | 'refunded';
export type ProgressStep = 'agreed' | 'funded' | 'delivered' | 'checked' | 'released';
export type NextAction =
  | 'accept'
  | 'fund'
  | 'deliver'
  | 'release'
  | 'claim'
  | 'review-manually'
  | 'respond-extension'
  | 'respond-cancel'
  | 'dispute'
  | null;
export type Actor = 'you' | 'counterparty' | 'nobody';
export type AutomaticOutcome = { kind: 'auto-release' | 'deadline-reclaim' | 'acceptance-expiry'; at: number } | null;

export interface DealViewInput {
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  firstReleasePct: number;
  createdAt: number;
  sellerApprovedAt?: number;
  acceptedAt?: number;
  delivered?: boolean;
  deliveredAt?: number;
  settledAt?: number;
  cancelledAt?: number;
  disputed?: boolean;
  checkedAt?: number;
  autoReleasedAt?: number;
  firstAutoReleased?: boolean;
  deadlineUnix?: number;
  acceptanceDeadlineUnix?: number;
  deadlineReclaimGraceMs?: number;
  releaseBlockedReason?: string;
  verificationStatus?: string;
  evidenceRequired?: boolean;
  evidenceManualReviewActive?: boolean;
  evidenceManualReviewAvailable?: boolean;
  evidenceReceiptState?: string;
  releaseEligibleAtMs?: number | null;
  cancellationProposal?: { proposedBy: 'buyer' | 'seller' };
  extensionRequest?: { requestedBy: 'seller' };
  onChain?: { state: number; milestonesReleased: number; milestonePcts: number[] } | null;
}

export interface DealView {
  stage: DealStage;
  money: { line: MoneyLine };
  progress: Array<{ step: ProgressStep; state: 'done' | 'current' | 'upcoming'; at?: number }>;
  next: { action: NextAction; actor: Actor; amountUsdc: string | null };
  automatic: AutomaticOutcome;
}

const MICROS = 1_000_000n;

function toMicros(usdc: string): bigint {
  const [whole = '0', fraction = ''] = usdc.split('.');
  return BigInt(whole || '0') * MICROS + BigInt((fraction + '000000').slice(0, 6));
}

function fromMicros(micros: bigint): string {
  const whole = micros / MICROS;
  const fraction = (micros % MICROS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function milestoneAmountUsdc(dealAmountUsdc: string, pct: number): string {
  return fromMicros((toMicros(dealAmountUsdc) * BigInt(pct)) / 100n);
}

function milestonePcts(deal: DealViewInput): number[] {
  const onChain = deal.onChain?.milestonePcts;
  if (onChain && onChain.length >= 2) return onChain;
  const first = deal.firstReleasePct;
  return first > 0 && first < 100 ? [first, 100 - first] : [50, 50];
}

export function stageOf(deal: DealViewInput): DealStage {
  const state = deal.onChain?.state;
  if (deal.cancelledAt || state === 5) return 'cancelled';
  if (deal.disputed || state === 4) return 'disputed';
  const released = deal.onChain?.milestonesReleased ?? 0;
  const total = milestonePcts(deal).length;
  if (deal.settledAt || state === 3 || released >= total || deal.autoReleasedAt) return 'settled';
  if (released >= total - 1 || (deal.firstAutoReleased && total === 2)) return 'awaiting-final-release';
  if (deal.delivered || deal.deliveredAt || released >= 1) return 'awaiting-first-release';
  if (deal.acceptedAt) return 'awaiting-delivery';
  if (deal.sellerApprovedAt) return 'awaiting-funding';
  return 'awaiting-acceptance';
}

function securityHold(deal: DealViewInput): boolean {
  return deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious'
    || deal.releaseBlockedReason === 'security-hold';
}

function paused(deal: DealViewInput): boolean {
  return !!deal.disputed || !!deal.releaseBlockedReason || securityHold(deal);
}

function moneyLine(deal: DealViewInput, stage: DealStage, pendingMovement: boolean): MoneyLine {
  if (stage === 'disputed') return 'paused';
  if (stage === 'cancelled') {
    if (!deal.acceptedAt) return 'not-funded';
    return deal.onChain?.state === 5 ? 'refunded' : 'refunding';
  }
  if (stage === 'settled') return 'released';
  if (pendingMovement) return 'sending';
  if (!deal.acceptedAt) return 'not-funded';
  return paused(deal) ? 'paused' : 'held';
}

function checkedDone(deal: DealViewInput, stage: DealStage): boolean {
  if (stage === 'settled') return true;
  if (deal.evidenceReceiptState === 'pass' || deal.evidenceManualReviewActive) return true;
  if (deal.evidenceRequired) return false;
  return (deal.onChain?.milestonesReleased ?? 0) >= 1 || !!deal.firstAutoReleased;
}

function progress(deal: DealViewInput, stage: DealStage): DealView['progress'] {
  const done: Record<ProgressStep, boolean> = {
    agreed: !!deal.sellerApprovedAt || !!deal.acceptedAt,
    funded: !!deal.acceptedAt,
    delivered: !!(deal.delivered || deal.deliveredAt),
    checked: checkedDone(deal, stage),
    released: stage === 'settled',
  };
  const at: Partial<Record<ProgressStep, number>> = {
    agreed: deal.sellerApprovedAt,
    funded: deal.acceptedAt,
    delivered: deal.deliveredAt,
    checked: deal.checkedAt,
    released: deal.settledAt ?? deal.autoReleasedAt,
  };
  const steps: ProgressStep[] = ['agreed', 'funded', 'delivered', 'checked', 'released'];
  const firstOpen = stage === 'cancelled' ? -1 : steps.findIndex((step) => !done[step]);
  return steps.map((step, index) => ({
    step,
    state: done[step] ? 'done' : index === firstOpen ? 'current' : 'upcoming',
    ...(at[step] != null ? { at: at[step] } : {}),
  }));
}

function nextShareUsdc(deal: DealViewInput): string {
  const pcts = milestonePcts(deal);
  const index = Math.min(deal.onChain?.milestonesReleased ?? 0, pcts.length - 1);
  return milestoneAmountUsdc(deal.dealAmountUsdc, pcts[index] ?? 50);
}

function next(deal: DealViewInput, stage: DealStage, viewer: 'buyer' | 'seller', now: number): DealView['next'] {
  const none = (actor: Actor): DealView['next'] => ({ action: null, actor, amountUsdc: null });
  const you = (action: Exclude<NextAction, null>, amountUsdc: string | null = null): DealView['next'] => ({ action, actor: 'you', amountUsdc });
  if (stage === 'settled' || stage === 'cancelled') return none('nobody');
  if (deal.cancellationProposal) {
    return deal.cancellationProposal.proposedBy === viewer ? none('counterparty') : you('respond-cancel');
  }
  if (stage === 'disputed') return none('nobody');
  if (stage === 'awaiting-acceptance') return viewer === 'seller' ? you('accept') : none('counterparty');
  if (stage === 'awaiting-funding') return viewer === 'buyer' ? you('fund', deal.dealAmountUsdc) : none('counterparty');
  if (stage === 'awaiting-delivery') {
    if (deal.extensionRequest) return viewer === 'buyer' ? you('respond-extension') : none('counterparty');
    return viewer === 'seller' ? you('deliver') : none('counterparty');
  }
  if (securityHold(deal)) return none('nobody');
  if (deal.releaseBlockedReason === 'requirement-mismatch') return viewer === 'seller' ? you('deliver') : you('dispute');
  if (deal.releaseBlockedReason === 'evidence-unavailable' || (deal.evidenceRequired && !checkedDone(deal, stage))) {
    if (viewer === 'buyer' && deal.evidenceManualReviewAvailable) return you('review-manually');
    return none('nobody');
  }
  if (viewer === 'buyer') return you('release', nextShareUsdc(deal));
  if (deal.releaseEligibleAtMs != null && deal.releaseEligibleAtMs <= now) return you('claim', nextShareUsdc(deal));
  return none('counterparty');
}

function automatic(deal: DealViewInput, stage: DealStage): AutomaticOutcome {
  if (stage === 'awaiting-acceptance' && deal.acceptanceDeadlineUnix) {
    return { kind: 'acceptance-expiry', at: deal.acceptanceDeadlineUnix * 1000 };
  }
  if (stage === 'awaiting-delivery' && deal.deadlineUnix) {
    return { kind: 'deadline-reclaim', at: deal.deadlineUnix * 1000 + (deal.deadlineReclaimGraceMs ?? 0) };
  }
  if ((stage === 'awaiting-first-release' || stage === 'awaiting-final-release') && !paused(deal) && deal.releaseEligibleAtMs != null) {
    return { kind: 'auto-release', at: deal.releaseEligibleAtMs };
  }
  return null;
}

export function dealView(
  deal: DealViewInput,
  viewer: 'buyer' | 'seller',
  pendingMovement: boolean,
  now: number,
): DealView {
  const stage = stageOf(deal);
  return {
    stage,
    money: { line: moneyLine(deal, stage, pendingMovement) },
    progress: progress(deal, stage),
    next: next(deal, stage, viewer, now),
    automatic: automatic(deal, stage),
  };
}
