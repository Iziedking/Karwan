/// Ranking for the assistant's market search. Pure, so it is tested without a
/// database: the caller passes the open offers and requests it read.

export interface OfferRow {
  id: string;
  sellerUser: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
  postedAt: number;
  readyInDays?: number;
}

export interface RequestRow {
  jobId: string;
  briefText: string;
  budgetUsdc: string;
  deadlineUnix: number;
  postedAt: number;
}

export interface MarketQuery {
  query?: string;
  kind: 'offers' | 'requests' | 'both';
  maxPriceUsdc?: number;
  /// The caller's own offers are left out; they cannot trade with themselves.
  excludeSeller?: string;
  limit?: number;
}

export type MarketHit =
  | { kind: 'offer'; id: string; title: string; priceUsdc: number; sellerUser: string; readyInDays?: number; score: number }
  | { kind: 'request'; jobId: string; title: string; budgetUsdc: number; dueUnix: number; score: number };

const STOP = new Set(['the', 'and', 'for', 'with', 'who', 'can', 'need', 'want', 'find', 'looking', 'someone', 'seller', 'sellers', 'buyer', 'buyers', 'offer', 'offers', 'request', 'requests', 'help', 'please', 'karwan', 'usdc', 'any', 'some', 'get', 'me', 'my']);

export function searchTerms(query = ''): string[] {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((t) => t.length > 2 && !STOP.has(t));
}

/// Title hits count double: a match in what is being sold beats a passing mention.
function score(terms: string[], title: string, body: string): number {
  if (terms.length === 0) return 1;
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  return terms.reduce((sum, term) => sum + (t.includes(term) ? 2 : 0) + (b.includes(term) ? 1 : 0), 0);
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
      const s = score(terms, o.title, o.description);
      if (s > 0) hits.push({ kind: 'offer', id: o.id, title: o.title, priceUsdc: o.askingPriceUsdc, sellerUser: o.sellerUser, readyInDays: o.readyInDays, score: s });
    }
  }
  if (q.kind !== 'offers') {
    for (const r of requests) {
      const budget = Number(r.budgetUsdc);
      if (q.maxPriceUsdc !== undefined && budget > q.maxPriceUsdc) continue;
      const s = score(terms, firstLine(r.briefText), r.briefText);
      if (s > 0) hits.push({ kind: 'request', jobId: r.jobId, title: firstLine(r.briefText), budgetUsdc: budget, dueUnix: r.deadlineUnix, score: s });
    }
  }
  const posted = (h: MarketHit) => (h.kind === 'offer' ? offers.find((o) => o.id === h.id)?.postedAt : requests.find((r) => r.jobId === h.jobId)?.postedAt) ?? 0;
  return hits.sort((a, b) => b.score - a.score || posted(b) - posted(a)).slice(0, limit);
}
