import { getAgentWallets } from '../db/agentWallets.js';
import { listAllBriefs } from '../db/briefs.js';
import { listDealsForAddress } from '../db/deals.js';
import { listListingsForSeller } from '../db/listings.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { stageOf } from '../deals/dealView.js';
import { readOwnedBalance } from '../money/ownedBalance.js';
import { telegramEnabled } from '../telegram/bot.js';
import type { FirstTradeFacts } from './firstTradeSteps.js';

export { firstTradeSteps } from './firstTradeSteps.js';

export async function readFirstTradeFacts(address: string): Promise<FirstTradeFacts> {
  const key = address.toLowerCase();
  const [wallets, owned, link, deals] = await Promise.all([
    getAgentWallets(key).catch(() => null),
    readOwnedBalance(key).catch(() => null),
    getTelegramLink(key).catch(() => null),
    listDealsForAddress(key).catch(() => []),
  ]);
  const postedRequest = listAllBriefs().some((brief) => brief.postedBy === key);
  const postedOffer = listListingsForSeller(key).length > 0;
  return {
    activated: !!wallets?.buyerAddress && !!wallets?.sellerAddress,
    balance: owned?.total ?? 0,
    telegram: link ? 'linked' : telegramEnabled() ? 'unlinked' : 'unavailable',
    startedTrade: deals.length > 0 || postedRequest || postedOffer,
    settledTrade: deals.some((deal) => stageOf(deal) === 'settled'),
  };
}
