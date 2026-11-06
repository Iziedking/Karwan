import type { DirectDeal } from '../db/deals.js';
import type { MatchProposal } from '../db/matchProposals.js';
import type { LocalAmount } from '../rates/quote.js';

/// The one next move for a person, from what Karwan already knows (view 57).
/// Fixed rules, no model: the web nudge, the assistant and Telegram all read
/// the same list, so "what should I do now?" has one answer everywhere.

export type NextMoveKind =
  | 'dispute_statement'
  | 'approve_delivery'
  | 'answer_cancel'
  | 'answer_extension'
  | 'take_back'
  | 'fund_deal'
  | 'approve_match'
  | 'agree_terms'
  | 'choose_offer'
  | 'deliver_soon'
  | 'first_post';

export interface NextMove {
  kind: NextMoveKind;
  /// The deal or request the move is about; absent for first_post.
  ref?: string;
  href: string;
  amountUsdc?: string;
  /// The figure the deal was agreed in, when it was agreed in a local currency (view 55).
  agreedLocal?: LocalAmount;
  days?: number;
  count?: number;
}

export interface NextMoveInput {
  address: string;
  deals: readonly DirectDeal[];
  proposals: readonly MatchProposal[];
  /// The person's own requests that have offers, with how many.
  requestsWithOffers: readonly { jobId: string; offers: number }[];
  /// Any request or offer for sale ever posted.
  postedAnything: boolean;
  /// Whether a dispute's statement window is still open (the dispute rules own this).
  statementOpen: (deal: DirectDeal) => boolean;
  now: number;
}

const ORDER: NextMoveKind[] = [
  'dispute_statement',
  'approve_delivery',
  'answer_cancel',
  'answer_extension',
  'take_back',
  'fund_deal',
  'approve_match',
  'agree_terms',
  'choose_offer',
  'deliver_soon',
  'first_post',
];

const DAY_MS = 86_400_000;

function dealMove(d: DirectDeal, me: string, statementOpen: NextMoveInput['statementOpen'], now: number): NextMove | null {
  if (d.settledAt || d.cancelledAt || d.legacyEscrow) return null;
  const side = d.buyer.toLowerCase() === me ? 'buyer' : d.seller?.toLowerCase() === me ? 'seller' : null;
  if (!side) return null;
  const base = {
    ref: d.jobId,
    href: `/deals/${d.jobId}`,
    amountUsdc: d.dealAmountUsdc,
    ...(d.agreedLocal ? { agreedLocal: d.agreedLocal } : {}),
  };
  const deadlineMs = d.deadlineUnix ? d.deadlineUnix * 1000 : null;
  const found: NextMoveKind[] = [];
  if (d.disputed && !d.judgeProposal && !d.disputeStatements?.[side] && statementOpen(d)) found.push('dispute_statement');
  if (d.delivered && side === 'buyer' && !d.disputed) found.push('approve_delivery');
  if (d.cancellationProposal && d.cancellationProposal.proposedBy !== side) found.push('answer_cancel');
  if (d.extensionRequest && side === 'buyer') found.push('answer_extension');
  if (side === 'buyer' && d.acceptedAt && !d.delivered && !d.disputed && deadlineMs !== null && deadlineMs <= now) found.push('take_back');
  if (side === 'buyer' && d.sellerApprovedAt && !d.acceptedAt && d.origin !== 'agent') found.push('fund_deal');
  if (side === 'seller' && !d.acceptedAt && !d.sellerApprovedAt && !d.pendingCounterparty) found.push('agree_terms');
  const dueSoon = side === 'seller' && d.acceptedAt && !d.delivered && deadlineMs !== null && deadlineMs > now && deadlineMs - now < 3 * DAY_MS;
  if (dueSoon) found.push('deliver_soon');
  const kind = ORDER.find((k) => found.includes(k));
  if (!kind) return null;
  if (kind === 'deliver_soon' && deadlineMs !== null) return { kind, ...base, days: Math.max(1, Math.ceil((deadlineMs - now) / DAY_MS)) };
  return { kind, ...base };
}

/// Every move waiting on this person, most urgent first, one per deal or request.
export function nextMoves(input: NextMoveInput): NextMove[] {
  const me = input.address.toLowerCase();
  const moves: NextMove[] = [];
  for (const d of input.deals) {
    const m = dealMove(d, me, input.statementOpen, input.now);
    if (m) moves.push(m);
  }
  const proposalJobs = new Set<string>();
  for (const p of input.proposals) {
    proposalJobs.add(p.jobId.toLowerCase());
    if (p.approvedAt || p.declinedAt) continue;
    if (p.deadlineUnix && p.deadlineUnix * 1000 <= input.now) continue;
    const myRole = p.buyerUser.toLowerCase() === me ? 'buyer' : 'seller';
    if ((p.awaitingParty ?? 'seller') !== myRole) continue;
    moves.push({ kind: 'approve_match', ref: p.jobId, href: `/jobs/${p.jobId}`, amountUsdc: p.raisedPriceUsdc ?? p.agreedPriceUsdc });
  }
  for (const r of input.requestsWithOffers) {
    if (r.offers < 1 || proposalJobs.has(r.jobId.toLowerCase())) continue;
    moves.push({ kind: 'choose_offer', ref: r.jobId, href: `/jobs/${r.jobId}`, count: r.offers });
  }
  if (moves.length === 0 && !input.postedAnything && input.deals.length === 0) {
    moves.push({ kind: 'first_post', href: '/buyer' });
  }
  return moves.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
