import { listAllBriefs } from '../db/briefs.js';
import { listDealsForAddress } from '../db/deals.js';
import { listListingsForSeller } from '../db/listings.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { getProfile } from '../db/profiles.js';
import { stageOf } from '../deals/dealView.js';
import { readOwnedBalance } from '../money/ownedBalance.js';
import { telegramEnabled } from '../telegram/bot.js';
import type { SetupFacts } from './setupSteps.js';

/// What is true for the account, for the setup list (view 57, 15 Nov). A
/// balance that could not be read stays null, so nobody is asked to add money
/// they already have.
export async function readSetupFacts(address: string, method: string | undefined): Promise<SetupFacts> {
  const key = address.toLowerCase();
  const [owned, link, deals, profile] = await Promise.all([
    readOwnedBalance(key, method).catch(() => null),
    getTelegramLink(key).catch(() => null),
    listDealsForAddress(key).catch(() => []),
    getProfile(key).catch(() => null),
  ]);
  const goals = profile?.goals ?? [];
  const sells = goals.some((g) => g === 'work' || g === 'sell');
  const buys = goals.includes('buy');
  const prefs = profile?.agentPrefs ?? {};
  const postedRequest = listAllBriefs().some((brief) => brief.postedBy === key);
  const postedOffer = listListingsForSeller(key).length > 0;
  return {
    setupDone: !!profile?.settings?.setupDoneAt,
    balance: owned ? owned.total : null,
    agentsBalance: owned ? owned.agents : null,
    agentMode: prefs.agentMode !== undefined,
    priceSet: !(sells && prefs.sellerPriceSet === false) && !(buys && prefs.buyerPriceSet === false),
    telegram: link ? 'linked' : telegramEnabled() ? 'unlinked' : 'unavailable',
    reach: profile?.settings?.notifyVia ?? null,
    startedTrade: deals.length > 0 || postedRequest || postedOffer,
    settledTrade: deals.some((deal) => stageOf(deal) === 'settled'),
    ownClients: prefs.findClients === false && sells,
  };
}
