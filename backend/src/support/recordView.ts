import { dealReference } from '../deals/reference.js';
import type { CaseKind, CaseNetwork, CaseState } from './caseRules.js';

/// What the support desk may see about a person and their records (view 78).
/// Each panel names every field it sends; nothing else from an account, a
/// deal or a money movement reaches the desk, so no wallet id, key, provider
/// id, contact detail or private assessment is ever shown to a teammate.

type Worth = { currency: string; amount: string };

export interface PersonPanel {
  name: string;
  handle: string | null;
  verified: boolean;
  network: CaseNetwork;
  earlierCases: Array<{ ref: string; kind: CaseKind; state: CaseState; createdAt: number }>;
}

export interface DealPanel {
  kind: 'deal';
  reference: string;
  amountUsdc: string;
  worth: Worth | null;
  otherSide: { name: string; handle: string | null } | null;
  state: 'waiting_for_seller' | 'declined' | 'funded' | 'delivered' | 'disputed' | 'settled' | 'cancelled';
  nextStep: string;
  updatedAt: number;
}

export interface TransferPanel {
  kind: 'transfer';
  reference: string;
  summary: string;
  amountUsdc: string;
  worth: Worth | null;
  state: string;
  failedReason: string | null;
  updatedAt: number;
}

export function personPanel(input: {
  profile: { displayName?: string; handle?: string } | null;
  verified: boolean;
  network: CaseNetwork;
  earlierCases: ReadonlyArray<{ ref: string; kind: CaseKind; state: CaseState; createdAt: number }>;
}): PersonPanel {
  return {
    name: input.profile?.displayName?.trim() || 'Not named yet',
    handle: input.profile?.handle ?? null,
    verified: input.verified,
    network: input.network,
    earlierCases: input.earlierCases.map((c) => ({ ref: c.ref, kind: c.kind, state: c.state, createdAt: c.createdAt })),
  };
}

interface DealSource {
  jobId: string;
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  settledWorth?: Record<string, Worth>;
  agreedLocal?: Worth;
  sellerDeclinedAt?: number;
  acceptedAt?: number;
  delivered?: boolean;
  disputed?: boolean;
  settledAt?: number;
  cancelledAt?: number;
  updatedAt: number;
}

const NEXT: Record<DealPanel['state'], string> = {
  waiting_for_seller: 'The seller has not accepted yet.',
  declined: 'The seller declined. Nothing was paid.',
  funded: 'Money is held. Waiting for the seller to deliver.',
  delivered: 'Delivered. Waiting for the buyer to release or raise a problem.',
  disputed: 'In dispute. A ruling needs two teammates.',
  settled: 'Settled. Money has been paid out.',
  cancelled: 'Cancelled. Held money went back to the buyer.',
};

function dealState(d: DealSource): DealPanel['state'] {
  if (d.cancelledAt) return 'cancelled';
  if (d.settledAt) return 'settled';
  if (d.disputed) return 'disputed';
  if (d.sellerDeclinedAt) return 'declined';
  if (d.delivered) return 'delivered';
  if (d.acceptedAt) return 'funded';
  return 'waiting_for_seller';
}

export function dealPanel(
  d: DealSource,
  ctx: { viewer: string; names: Record<string, { name: string; handle: string | null }> },
): DealPanel {
  const me = ctx.viewer.toLowerCase();
  const other = d.buyer.toLowerCase() === me ? d.seller.toLowerCase() : d.buyer.toLowerCase();
  const worth = d.settledWorth?.[me] ?? d.agreedLocal ?? null;
  const state = dealState(d);
  return {
    kind: 'deal',
    reference: dealReference(d.jobId) ?? d.jobId.slice(0, 10),
    amountUsdc: d.dealAmountUsdc,
    worth: worth ? { currency: worth.currency, amount: worth.amount } : null,
    otherSide: ctx.names[other] ? { name: ctx.names[other]!.name, handle: ctx.names[other]!.handle } : null,
    state,
    nextStep: NEXT[state],
    updatedAt: d.updatedAt,
  };
}

interface MovementSource {
  reference: string;
  summary: string;
  amountMicros: string;
  state: string;
  failureCode?: string;
  worth?: Record<string, Worth>;
  local?: Worth;
  updatedAt: number;
}

const usdc = (micros: string) => String(Number(BigInt(micros)) / 1_000_000);

export function transferPanel(m: MovementSource, ctx: { viewer: string }): TransferPanel {
  const worth = m.worth?.[ctx.viewer.toLowerCase()] ?? m.local ?? null;
  return {
    kind: 'transfer',
    reference: m.reference,
    summary: m.summary,
    amountUsdc: usdc(m.amountMicros),
    worth: worth ? { currency: worth.currency, amount: worth.amount } : null,
    state: m.state,
    failedReason: m.failureCode ?? null,
    updatedAt: m.updatedAt,
  };
}
