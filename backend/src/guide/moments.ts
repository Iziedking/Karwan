import type { KarwanEvent } from '../events.js';

/// Moments (view 57, 15 Nov evening): one notable thing on the account, said
/// once, with a face that fits it. The website shows the line beside Aman; the
/// assistant gives the same one first. Lines are keys; each channel words them.

export type MomentMood = 'excited' | 'sad' | 'hurt';
export type MomentLine = 'paid' | 'released' | 'tier' | 'lapsed' | 'late' | 'pocketPaid' | 'offer' | 'entry';

export interface Moment {
  id: string;
  /// When it happened; marking it seen stores this, so other devices skip it.
  at: number;
  mood: MomentMood;
  line: MomentLine;
  href: string;
  amountUsdc?: string;
}

export interface MomentContext {
  me: string;
  /// The person's side on the deal the event is about, when it is a deal.
  role: 'buyer' | 'seller' | null;
  /// Whether the event's request is the person's own (offers withdrawn from it).
  ownsRequest?: boolean;
  /// What the deal says about a ruling and a guarantee backed from the pocket.
  deal?: { guaranteeBackedAt?: number; resolvedSellerBps?: number };
}

export const MOMENT_MAX_AGE_MS = 48 * 3600_000;
/// Smaller payments are not worth a reaction.
const MIN_CREDIT_USDC = 1;

const same = (a: unknown, me: string) => typeof a === 'string' && a.toLowerCase() === me.toLowerCase();
const trimUsdc = (n: number) => String(Number(n.toFixed(6)));

export function momentFor(e: KarwanEvent, ctx: MomentContext): Moment | null {
  const base = { id: `${e.type}:${e.jobId ?? ''}:${e.ts}`, at: e.ts };
  const deal = e.jobId ? `/deals/${e.jobId}` : '/deals';
  const p = e.payload ?? {};
  switch (e.type) {
    case 'escrow.seller.paid': {
      if (ctx.role !== 'seller') return null;
      const micros = Number(p.sellerMicros);
      return { ...base, mood: 'excited', line: 'paid', href: deal, ...(Number.isFinite(micros) && micros > 0 ? { amountUsdc: trimUsdc(micros / 1e6) } : {}) };
    }
    case 'escrow.settled':
      return ctx.role === 'seller' ? { ...base, mood: 'excited', line: 'paid', href: deal } : null;
    case 'wallet.credited': {
      const amount = Number(p.amountUsdc);
      if (!same(p.address ?? p.owner, ctx.me) || !Number.isFinite(amount) || amount < MIN_CREDIT_USDC) return null;
      return { ...base, mood: 'excited', line: 'paid', href: '/activity', amountUsdc: trimUsdc(amount) };
    }
    case 'deal.delivery.cleared':
      return ctx.role === 'seller' ? { ...base, mood: 'excited', line: 'released', href: deal } : null;
    case 'reputation.tier-up':
      return same(p.address, ctx.me) ? { ...base, mood: 'excited', line: 'tier', href: '/reputation' } : null;
    case 'deal.cancelled':
    case 'deal.acceptance.expired':
      return ctx.role ? { ...base, mood: 'sad', line: 'lapsed', href: '/market' } : null;
    case 'job.expired':
      return same(p.buyer, ctx.me) ? { ...base, mood: 'sad', line: 'lapsed', href: e.jobId ? `/jobs/${e.jobId}` : '/market' } : null;
    // Good news worth a word (owner, 16 Nov 2026: "no smart nudges"): an offer
    // on their own request, and someone entering their contest.
    case 'offer.created':
    case 'bid.submitted':
      return ctx.ownsRequest ? { ...base, mood: 'excited', line: 'offer', href: e.jobId ? `/jobs/${e.jobId}` : '/market' } : null;
    case 'contest.entered':
      return same(p.buyer, ctx.me) && !p.replaced && typeof p.contestId === 'string'
        ? { ...base, mood: 'excited', line: 'entry', href: `/contests/${encodeURIComponent(p.contestId)}` }
        : null;
    case 'offer.withdrawn':
      return ctx.ownsRequest ? { ...base, mood: 'sad', line: 'lapsed', href: e.jobId ? `/jobs/${e.jobId}` : '/market' } : null;
    case 'deal.match.declined':
      return same(p.seller, ctx.me) ? { ...base, mood: 'sad', line: 'lapsed', href: '/market' } : null;
    case 'deal.deadline.passed':
      return ctx.role ? { ...base, mood: 'sad', line: 'late', href: deal } : null;
    case 'escrow.resolved': {
      const d = ctx.deal;
      const buyerGotSome = typeof d?.resolvedSellerBps === 'number' && d.resolvedSellerBps < 10_000;
      return ctx.role === 'seller' && d?.guaranteeBackedAt && buyerGotSome ? { ...base, mood: 'hurt', line: 'pocketPaid', href: deal } : null;
    }
    default:
      return null;
  }
}

/// The newest moment after `since` and no older than two days, or null.
export function pickMoment(candidates: readonly { event: KarwanEvent; ctx: MomentContext }[], since: number, now: number): Moment | null {
  let best: Moment | null = null;
  for (const { event, ctx } of candidates) {
    if (event.ts <= since || now - event.ts > MOMENT_MAX_AGE_MS) continue;
    const m = momentFor(event, ctx);
    if (m && (!best || m.at > best.at)) best = m;
  }
  return best;
}
