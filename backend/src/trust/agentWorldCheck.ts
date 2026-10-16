import type { Role, TrustDecision, TrustReason } from './riskEngine.js';

/// The World ID step on an agent deal. When the buyer chooses an offer, the
/// trust rules may ask the buyer, the seller or both to prove they are a real,
/// unique person before escrow is funded. The hold remembers who still has to
/// check, for one seller at one price, so a changed price or seller asks again.

export type PartyState = 'pending' | 'verified' | 'skipped';

export interface AgentWorldHold {
  jobId: string;
  sellerAgent: string;
  priceUsdc: string;
  buyerUser: string;
  sellerUser: string;
  key: string;
  need: Partial<Record<Role, TrustReason>>;
  buyer: PartyState | null;
  seller: PartyState | null;
  /// The buyer confirmed the choice and is only waiting on the seller's check.
  buyerConfirmed: boolean;
  acknowledgeUnverified: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AgentWorldStep = { kind: 'proceed' } | { kind: Role; reason: TrustReason };

export function agentCheckKey(sellerAgent: string, priceUsdc: string | number): string {
  return `agent:${sellerAgent.toLowerCase()}:${Number(priceUsdc).toFixed(6)}`;
}

export function holdFor(
  prev: AgentWorldHold | null,
  input: {
    jobId: string;
    sellerAgent: string;
    priceUsdc: string;
    buyerUser: string;
    sellerUser: string;
    decision: TrustDecision;
    now: number;
  },
): AgentWorldHold | null {
  const need = input.decision.verify;
  if (!need.buyer && !need.seller) return null;
  const key = agentCheckKey(input.sellerAgent, input.priceUsdc);
  const same = prev && prev.key === key ? prev : null;
  return {
    jobId: input.jobId.toLowerCase(),
    sellerAgent: input.sellerAgent.toLowerCase(),
    priceUsdc: input.priceUsdc,
    buyerUser: input.buyerUser.toLowerCase(),
    sellerUser: input.sellerUser.toLowerCase(),
    key,
    need: { ...need },
    buyer: need.buyer ? (same?.buyer ?? 'pending') : null,
    seller: need.seller ? (same?.seller ?? 'pending') : null,
    buyerConfirmed: same?.buyerConfirmed ?? false,
    acknowledgeUnverified: same?.acknowledgeUnverified ?? false,
    createdAt: same?.createdAt ?? input.now,
    updatedAt: input.now,
  };
}

const done = (state: PartyState | null, allowSkip: boolean) =>
  state === null || state === 'verified' || (allowSkip && state === 'skipped');

/// Who has to check next. The buyer goes first: they are the one acting.
export function nextStep(hold: AgentWorldHold | null, allowSkip: boolean): AgentWorldStep {
  if (!hold) return { kind: 'proceed' };
  if (!done(hold.buyer, allowSkip) && hold.need.buyer) return { kind: 'buyer', reason: hold.need.buyer };
  if (!done(hold.seller, allowSkip) && hold.need.seller) return { kind: 'seller', reason: hold.need.seller };
  return { kind: 'proceed' };
}
