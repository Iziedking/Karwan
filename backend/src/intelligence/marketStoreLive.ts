import { listAllBriefs } from '../db/briefs.js';
import { listOpenListings } from '../db/listings.js';
import { allDealPrices } from '../db/priceObservations.js';
import { webPriceBands } from '../x402/externalClient.js';
import { priceBands, weeklyDemand } from './marketStore.js';

/// The market as one picture (view 48, step 4): demand by category, what
/// Karwan deals settled at, and the web's range as a second signal. The Home
/// trending card, the assistant and the seller nudge all read this.
export function currentMarket(now = Date.now()) {
  return {
    demand: weeklyDemand(listAllBriefs(), listOpenListings(), now),
    karwanPrices: priceBands(allDealPrices(), now),
    webPrices: webPriceBands(now),
  };
}
