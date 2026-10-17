/// Ranking for the assistant's market search. Pure, so it is tested without a
/// database: the caller passes the open offers and requests it read.
/// Location is read here to rank and to leave out people who do not deliver to
/// the caller; only the country ever goes out in a hit.

import { kindOf, locationFit, publicLocation, servesCountry, type DeliveryKind, type PrivateLocation, type Where } from '../location/rules.js';

export interface OfferRow {
  id: string;
  sellerUser: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
  postedAt: number;
  readyInDays?: number;
  deliveryKind?: DeliveryKind;
  sellerLocation?: PrivateLocation | null;
}

export interface RequestRow {
  jobId: string;
  briefText: string;
  budgetUsdc: string;
  deadlineUnix: number;
  postedAt: number;
  deliveryKind?: DeliveryKind;
  tradeType?: string;
  where?: Where;
  buyerLocation?: PrivateLocation | null;
}

export interface MarketQuery {
  query?: string;
  kind: 'offers' | 'requests' | 'both';
  maxPriceUsdc?: number;
  /// The caller's own offers are left out; they cannot trade with themselves.
  excludeSeller?: string;
  limit?: number;
  /// The caller's own private location. Used to rank and filter; never returned.
  near?: PrivateLocation | null;
  /// Where the caller wants offers from. Missing means anywhere.
  where?: Where;
}

export type MarketHit =
  | { kind: 'offer'; id: string; title: string; priceUsdc: number; sellerUser: string; readyInDays?: number; score: number; fit: number; country: string | null }
  | { kind: 'request'; jobId: string; title: string; budgetUsdc: number; dueUnix: number; score: number; fit: number; country: string | null };

const STOP = new Set(['the', 'and', 'for', 'with', 'who', 'can', 'need', 'want', 'find', 'looking', 'someone', 'seller', 'sellers', 'buyer', 'buyers', 'offer', 'offers', 'request', 'requests', 'help', 'please', 'karwan', 'usdc', 'any', 'some', 'get', 'me', 'my']);

export function searchTerms(query = ''): string[] {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((t) => t.length > 2 && !STOP.has(t));
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/// A term counts when it starts a word ("design" finds "designer"), never in
/// the middle of one. Every term must match; a search of three or more words
/// may miss one. Title hits count double: what is being sold beats a mention.
function score(terms: string[], title: string, body: string): number {
  if (terms.length === 0) return 1;
  const t = words(title);
  const b = words(body);
  let matched = 0;
  let points = 0;
  for (const term of terms) {
    const inTitle = t.some((w) => w.startsWith(term));
    const inBody = b.some((w) => w.startsWith(term));
    if (inTitle || inBody) matched += 1;
    points += (inTitle ? 2 : 0) + (inBody ? 1 : 0);
  }
  const needed = terms.length >= 3 ? terms.length - 1 : terms.length;
  return matched >= needed ? points : 0;
}

function firstLine(text: string): string {
  return (text.split('\n').find((line) => line.trim()) ?? text).trim().slice(0, 120);
}

export function searchMarket(q: MarketQuery, offers: OfferRow[], requests: RequestRow[]): MarketHit[] {
  const terms = searchTerms(q.query);
  const limit = Math.min(Math.max(q.limit ?? 5, 1), 10);
  const exclude = q.excludeSeller?.toLowerCase();
  const hits: MarketHit[] = [];
  if (q.kind !== 'requests') {
    for (const o of offers) {
      if (exclude && o.sellerUser.toLowerCase() === exclude) continue;
      if (q.maxPriceUsdc !== undefined && o.askingPriceUsdc > q.maxPriceUsdc) continue;
      const kind = kindOf(o);
      if (q.near && servesCountry(o.sellerLocation ?? null, q.near.country, kind) === 'no') continue;
      const s = score(terms, o.title, o.description);
      const fit = q.near ? locationFit(q.where, q.near, o.sellerLocation ?? null, kind) : 1;
      if (s > 0) hits.push({ kind: 'offer', id: o.id, title: o.title, priceUsdc: o.askingPriceUsdc, sellerUser: o.sellerUser, readyInDays: o.readyInDays, score: s, fit, country: publicLocation(o.sellerLocation).country });
    }
  }
  if (q.kind !== 'offers') {
    for (const r of requests) {
      const budget = Number(r.budgetUsdc);
      if (q.maxPriceUsdc !== undefined && budget > q.maxPriceUsdc) continue;
      const kind = kindOf(r);
      if (q.near && servesCountry(q.near, r.buyerLocation?.country ?? null, kind) === 'no') continue;
      const s = score(terms, firstLine(r.briefText), r.briefText);
      const fit = q.near ? locationFit(r.where, r.buyerLocation ?? null, q.near, kind) : 1;
      if (s > 0) hits.push({ kind: 'request', jobId: r.jobId, title: firstLine(r.briefText), budgetUsdc: budget, dueUnix: r.deadlineUnix, score: s, fit, country: publicLocation(r.buyerLocation).country });
    }
  }
  const posted = (h: MarketHit) => (h.kind === 'offer' ? offers.find((o) => o.id === h.id)?.postedAt : requests.find((r) => r.jobId === h.jobId)?.postedAt) ?? 0;
  // Skill fit first, then location fit, then the newest.
  return hits.sort((a, b) => b.score - a.score || b.fit - a.fit || posted(b) - posted(a)).slice(0, limit);
}
