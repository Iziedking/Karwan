import { listAllAgentWallets } from '../db/agentWallets.js';
import { listAllBriefs } from '../db/briefs.js';
import { GENERIC_TAG_WORDS, NAIVE_STOPWORDS } from '../llm/keywords.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import type { Listing } from '../db/listings.js';
import { isPublic } from '../market/visibility.js';

/// When a new offer is posted, every activated account hears about it once, in
/// one of two ways:
/// - `listing.match.proactive`: it fits what they asked for themselves, a
///   request they posted in the last 30 days. The alert names the words it fits.
/// - `listing.new`: everyone else, as news from the market.
/// A private offer (visibility 'agents') is never news; it reaches a person only
/// when it fits their own request. No money moves without their own click.

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_NOTIFY_TTL_MS = 24 * 60 * 60 * 1000;
const recentlyNotified = new Map<string, number>();

function pruneDedupe(now: number): void {
  for (const [key, ts] of recentlyNotified) if (ts < now - RECENT_NOTIFY_TTL_MS) recentlyNotified.delete(key);
}

/// Words in almost every offer or request, which say nothing about what it is.
const FILLER = new Set([
  'and', 'for', 'the', 'with', 'from', 'this', 'that', 'you', 'your', 'our', 'are', 'have', 'has', 'can', 'will', 'all', 'any',
  'need', 'needed', 'want', 'wanted', 'looking', 'please', 'buy', 'sell', 'sale', 'selling', 'offer', 'request', 'item', 'items',
  'delivery', 'deliver', 'delivered', 'price', 'pricing', 'prices', 'fair', 'cheap', 'best', 'great', 'wide', 'range', 'stock',
  'available', 'reliable', 'new', 'used', 'condition', 'ready', 'fast', 'quick', 'now', 'today', 'week', 'usdc',
]);

/// The words that carry meaning: three letters or more, never shop filler.
function topicWords(texts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) {
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length < 3 || FILLER.has(w) || GENERIC_TAG_WORDS.has(w) || NAIVE_STOPWORDS.has(w)) continue;
      out.add(w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
    }
  }
  return out;
}

/// Which alert a person gets for a new offer, from their own recent requests.
/// Whole words only, so "parts" never fits "departure".
export function alertFor(
  ownRequests: readonly { briefText?: string; keywords?: readonly string[] }[],
  listing: Pick<Listing, 'title' | 'description' | 'visibility'>,
): { kind: 'fits'; words: string[] } | { kind: 'new' } | null {
  const asked = topicWords(ownRequests.flatMap((r) => [r.briefText ?? '', ...(r.keywords ?? [])]));
  const offered = topicWords([listing.title, listing.description]);
  const words = [...asked].filter((w) => offered.has(w)).slice(0, 3);
  if (words.length) return { kind: 'fits', words };
  return isPublic(listing) ? { kind: 'new' } : null;
}

export async function scanBuyersForListing(listing: Listing): Promise<{ fits: number; news: number }> {
  const now = Date.now();
  pruneDedupe(now);
  const briefs = listAllBriefs();
  const wallets = await listAllAgentWallets();
  let fits = 0;
  let news = 0;

  for (const w of wallets) {
    if (w.userAddress.toLowerCase() === listing.sellerUser.toLowerCase()) continue;
    const key = `${w.userAddress.toLowerCase()}:${listing.id}`;
    if (recentlyNotified.has(key)) continue;
    const own = briefs.filter((b) => b.postedBy === w.userAddress.toLowerCase() && now - b.createdAt < HISTORY_WINDOW_MS);
    const alert = alertFor(own, listing);
    if (!alert) continue;
    recentlyNotified.set(key, now);
    const payload = {
      listingId: listing.id,
      listingTitle: listing.title,
      listingAskingPriceUsdc: listing.askingPriceUsdc,
      sellerUser: listing.sellerUser,
      buyerUser: w.userAddress,
    };
    if (alert.kind === 'fits') {
      fits += 1;
      bus.emitEvent({ type: 'listing.match.proactive', actor: 'platform', payload: { ...payload, matched: alert.words } });
    } else {
      news += 1;
      bus.emitEvent({ type: 'listing.new', actor: 'platform', payload });
    }
  }

  if (fits || news) logger.info({ listingId: listing.id, fits, news }, 'new offer: alerts sent');
  return { fits, news };
}
