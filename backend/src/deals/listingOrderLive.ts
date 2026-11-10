import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import type { Listing } from '../db/listings.js';
import { agentPrefsOf, getProfile } from '../db/profiles.js';
import { listingHeldByOrder, orderWait, sellerAsksOnOrders, type OrderWait } from './listingOrder.js';

/// Whether this seller looks at each order themselves (view 75, decision 2).
/// A profile that cannot be read asks nothing new: the order runs as before.
export async function sellerAsksFirst(sellerUser: string): Promise<boolean> {
  if (!config.SELLER_ASKED) return false;
  const profile = await getProfile(sellerUser.toLowerCase()).catch(() => null);
  return sellerAsksOnOrders(agentPrefsOf(profile), true);
}

/// Why an order on this listing would wait for the seller, or null when their
/// agent accepts it at once.
export async function listingOrderWait(listing: Listing, now: number): Promise<OrderWait | null> {
  const [held, asks] = await Promise.all([listingHeldByOrder(listing, getDeal, now), sellerAsksFirst(listing.sellerUser)]);
  return orderWait(held, asks);
}
