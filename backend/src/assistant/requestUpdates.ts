import type { AssistantAction } from './actions.js';

/// The negotiation, followed from the assistant (view 30). Every request
/// posted from a conversation adds one line to it: where the request stands
/// now, and the one card that moves it on. It is built fresh on every read and
/// never stored, so a newer state replaces the older one instead of stacking.
/// Milestones only: never each round of counters.

export interface ShortlistPick {
  seller: string;
  name: string;
  tag: string | null;
  priceUsdc: number;
  recommended: boolean;
  verified: boolean;
  state: 'negotiating' | 'ready' | 'unavailable';
}

export interface RequestView {
  jobId: string;
  budgetUsdc: number;
  agreeForMe: boolean;
  offers: { count: number; lowestUsdc: number | null };
  shortlist: ShortlistPick[] | null;
  /// A near match the buyer is asked about, only when nothing within budget is live.
  nearMiss: { proceedPriceUsdc: number; gapUsdc: number } | null;
  proposal: { priceUsdc: number; counterparty: string; awaitingBuyer: boolean; deadlineUnix: number } | null;
  deal: { amountUsdc: number; counterparty: string; funded: boolean; delivered: boolean; settled: boolean } | null;
  ended: 'expired' | 'cancelled' | 'no_agreement' | null;
}

export type UpdateCard =
  | { kind: 'choose'; seller: string; label: string; priceUsdc: number; unverified: boolean }
  | { kind: 'approve'; label: string; priceUsdc: number; deadlineUnix: number }
  | { kind: 'request' }
  | { kind: 'deal' };

export interface RequestUpdate {
  content: string;
  cards: UpdateCard[];
}

const usdc = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
const who = (p: { tag: string | null; name: string }) => (p.tag ? `@${p.tag.replace(/^@/, '')}` : p.name);
const LEAVE = "You can close this; I'll write here and on Telegram when there is something to decide.";

export function requestUpdate(v: RequestView): RequestUpdate {
  if (v.deal?.settled) return { content: `Done: your deal with ${v.deal.counterparty} settled.`, cards: [] };
  if (v.deal?.delivered) {
    return { content: `${v.deal.counterparty} delivered. Review the work, then release the payment.`, cards: [{ kind: 'deal' }] };
  }
  if (v.deal?.funded) {
    return { content: `${usdc(v.deal.amountUsdc)} USDC is locked in escrow with ${v.deal.counterparty}. I'll tell you here when they deliver.`, cards: [{ kind: 'deal' }] };
  }
  if (v.proposal) {
    return v.proposal.awaitingBuyer
      ? {
          content: `Your agent agreed ${usdc(v.proposal.priceUsdc)} USDC with ${v.proposal.counterparty}. Approve to lock the money in escrow; nothing moves until you do.`,
          cards: [{ kind: 'approve', label: v.proposal.counterparty, priceUsdc: v.proposal.priceUsdc, deadlineUnix: v.proposal.deadlineUnix }],
        }
      : { content: `Your agent agreed ${usdc(v.proposal.priceUsdc)} USDC with ${v.proposal.counterparty}. Waiting for them to accept.`, cards: [{ kind: 'request' }] };
  }
  if (v.ended) {
    return {
      content: v.ended === 'expired' ? 'This request reached its deadline without a deal.' : v.ended === 'cancelled' ? 'This request was cancelled.' : 'This request closed without a deal.',
      cards: [],
    };
  }
  const ready = (v.shortlist ?? []).filter((e) => e.state === 'ready');
  if (ready.length > 0) {
    const pick = ready.find((e) => e.recommended) ?? null;
    const lowest = Math.min(...ready.map((e) => e.priceUsdc));
    if (v.agreeForMe && pick && pick.priceUsdc <= v.budgetUsdc) {
      return {
        content: `Agreed for you: your agent agreed ${usdc(pick.priceUsdc)} USDC with ${who(pick)}, the seller it recommends, within your budget of ${usdc(v.budgetUsdc)} USDC. Tap to lock the money in escrow; nothing moves until you do.`,
        cards: [{ kind: 'choose', seller: pick.seller, label: who(pick), priceUsdc: pick.priceUsdc, unverified: !pick.verified }, { kind: 'request' }],
      };
    }
    const offers = ready.length === 1 ? `1 offer, ${usdc(lowest)} USDC` : `${ready.length} offers, from ${usdc(lowest)} USDC`;
    return {
      content: `Your shortlist is ready: ${offers}.${pick ? ` Your agent recommends ${who(pick)} at ${usdc(pick.priceUsdc)} USDC.` : ''}`,
      cards: [
        ...(pick ? [{ kind: 'choose' as const, seller: pick.seller, label: who(pick), priceUsdc: pick.priceUsdc, unverified: !pick.verified }] : []),
        { kind: 'request' },
      ],
    };
  }
  if (v.nearMiss) {
    return {
      content: `Near match: ${usdc(v.nearMiss.proceedPriceUsdc)} USDC, ${usdc(v.nearMiss.gapUsdc)} USDC above your budget, and nothing within budget so far. Proceed or pass on the request; nothing moves until you decide.`,
      cards: [{ kind: 'request' }],
    };
  }
  if (v.offers.count > 0) {
    const offers = v.offers.count === 1 ? '1 offer is in' : `${v.offers.count} offers are in`;
    return {
      content: `${offers}${v.offers.lowestUsdc !== null ? `, from ${usdc(v.offers.lowestUsdc)} USDC` : ''}. Your agent is still negotiating. ${LEAVE}`,
      cards: [{ kind: 'request' }],
    };
  }
  return {
    content: `Your agent is on it, asking sellers for offers. ${LEAVE}${
      v.agreeForMe ? " Agree for me is on: you can sleep, and you'll wake up to an agreed deal here, ready for one tap to lock the money." : ''
    }`,
    cards: [{ kind: 'request' }],
  };
}

export interface CardBuilders {
  choose: (c: Extract<UpdateCard, { kind: 'choose' }>, jobId: string) => AssistantAction | { error: string };
  approve: (c: Extract<UpdateCard, { kind: 'approve' }>, jobId: string) => AssistantAction | { error: string };
  request: (jobId: string) => AssistantAction | { error: string };
  deal: (jobId: string) => AssistantAction | { error: string };
}

/// The update as an assistant turn, marked live so the page replaces it rather
/// than saving it.
export function updateTurn(jobId: string, u: RequestUpdate, build: CardBuilders) {
  const actions = u.cards
    .map((c) => (c.kind === 'choose' ? build.choose(c, jobId) : c.kind === 'approve' ? build.approve(c, jobId) : c.kind === 'request' ? build.request(jobId) : build.deal(jobId)))
    .filter((a): a is AssistantAction => !('error' in a));
  return { role: 'assistant' as const, content: u.content, actions, live: true as const };
}

/// The seller the agent agreed with for the buyer, or null.
export function agreedPick(shortlist: readonly ShortlistPick[], budgetUsdc: number): ShortlistPick | null {
  const pick = shortlist.find((e) => e.recommended && e.state === 'ready') ?? null;
  return pick && pick.priceUsdc > 0 && pick.priceUsdc <= budgetUsdc ? pick : null;
}

export function agreedLine(pick: Pick<ShortlistPick, 'name' | 'tag' | 'priceUsdc'>): string {
  const who = pick.tag ? `@${pick.tag.replace(/^@/, '')}` : pick.name;
  return `*Agreed for you.* Your agent agreed ${pick.priceUsdc} USDC with ${who}, the seller it recommends, within your budget. Tap to lock the money in escrow; nothing moves until you do.`;
}
