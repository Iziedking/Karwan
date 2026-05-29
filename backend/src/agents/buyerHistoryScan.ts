import { listAllAgentWallets } from '../db/agentWallets.js';
import { listAllBriefs } from '../db/briefs.js';
import { listDealsForAddress } from '../db/deals.js';
import { topicalOverlap } from '../llm/keywords.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import type { Listing } from '../db/listings.js';

/// Proactive buyer-side cross-match. When a new offer (listing) is posted, walk
/// every activated user's history (their past briefs + delivered deals) and
/// surface the offer to anyone whose past activity overlaps topically with
/// what the seller is offering. The buyer sees a Telegram + bell ping with a
/// link to the listing; they decide whether to open a direct deal. No spend
/// happens without that explicit click, which keeps the two-human-gate rule
/// in [[karwan-product-shape]] intact.

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RECENT_NOTIFY_TTL_MS = 24 * 60 * 60 * 1000; // dedupe per user+listing
const recentlyNotified = new Map<string, number>();

function dedupeKey(userAddress: string, listingId: string): string {
  return `${userAddress.toLowerCase()}:${listingId}`;
}

function pruneDedupe(): void {
  const cutoff = Date.now() - RECENT_NOTIFY_TTL_MS;
  for (const [key, ts] of recentlyNotified) {
    if (ts < cutoff) recentlyNotified.delete(key);
  }
}

function gatherBuyerHistoryKeywords(
  userAddress: string,
  briefs: ReturnType<typeof listAllBriefs>,
  recentDealKeywords: string[],
): string[] {
  const now = Date.now();
  const recentBriefs = briefs.filter(
    (b) => b.postedBy === userAddress && now - b.createdAt < HISTORY_WINDOW_MS,
  );
  const briefKws = recentBriefs.flatMap((b) => b.keywords ?? []);
  return Array.from(new Set([...briefKws, ...recentDealKeywords]));
}

async function gatherDealKeywordsForBuyer(userAddress: string): Promise<string[]> {
  const deals = await listDealsForAddress(userAddress);
  const now = Date.now();
  const recent = deals.filter(
    (d) => d.buyer === userAddress && now - d.createdAt < HISTORY_WINDOW_MS,
  );
  // Use deal terms as a fallback signal source. Brief text would be better but
  // recent briefs are already captured above; deals reflect past trades the
  // buyer actually settled, which is the strongest signal of repeat interest.
  return recent.flatMap((d) => splitTerms(d.terms));
}

function splitTerms(terms: string): string[] {
  if (!terms) return [];
  return terms
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3);
}

/// Walk all activated buyers; emit a proactive-match event for each whose
/// recent activity topically overlaps the new listing. Buyer is the asked
/// side; they can open the listing and start a direct deal from there.
export async function scanBuyersForListing(listing: Listing): Promise<number> {
  pruneDedupe();
  const briefs = listAllBriefs();
  const wallets = await listAllAgentWallets();
  const listingHaystack = [listing.title, listing.description];
  let matchedCount = 0;

  for (const w of wallets) {
    // Don't proactively notify the seller about their own listing.
    if (w.userAddress === listing.sellerUser) continue;

    const dedupe = dedupeKey(w.userAddress, listing.id);
    if (recentlyNotified.has(dedupe)) continue;

    let dealKws: string[] = [];
    try {
      dealKws = await gatherDealKeywordsForBuyer(w.userAddress);
    } catch (err) {
      logger.warn(
        { user: w.userAddress, err: (err as Error).message },
        'proactive scan: deal history read failed',
      );
    }
    const history = gatherBuyerHistoryKeywords(w.userAddress, briefs, dealKws);
    if (history.length === 0) continue;
    if (topicalOverlap(history, listingHaystack) <= 0) continue;

    recentlyNotified.set(dedupe, Date.now());
    matchedCount += 1;
    bus.emitEvent({
      type: 'listing.match.proactive',
      actor: 'platform',
      payload: {
        listingId: listing.id,
        listingTitle: listing.title,
        listingAskingPriceUsdc: listing.askingPriceUsdc,
        sellerUser: listing.sellerUser,
        buyerUser: w.userAddress,
      },
    });
  }

  if (matchedCount > 0) {
    logger.info(
      { listingId: listing.id, matchedCount },
      'proactive buyer-history scan surfaced offer to interested buyers',
    );
  }
  return matchedCount;
}
