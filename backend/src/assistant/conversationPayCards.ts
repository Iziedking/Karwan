import { listDealsForAddress, type DirectDeal } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { payCardFor } from './directDealTools.js';
import { conversationReference } from './dealDraft.js';

export { conversationReference };

/// Deals made in this conversation that the seller accepted and nobody has paid yet.
export function awaitingPayment(deals: readonly DirectDeal[], buyer: string, conversationId: string): DirectDeal[] {
  const ref = conversationReference(conversationId);
  return deals.filter(
    (d) =>
      d.buyer.toLowerCase() === buyer.toLowerCase() &&
      d.sourceContext?.reference === ref &&
      !!d.sellerApprovedAt &&
      !d.acceptedAt &&
      !d.fundTxHash &&
      !d.cancelledAt,
  );
}

export async function payCardsForConversation(address: string, conversationId: string) {
  const deals = awaitingPayment(await listDealsForAddress(address), address, conversationId);
  const turns: Array<{ role: 'assistant'; content: string; actions: unknown[] }> = [];
  for (const deal of deals) {
    const card = await payCardFor(deal, address);
    if ('error' in card) continue;
    const seller = (await getProfile(deal.seller).catch(() => null))?.displayName?.trim() || 'The seller';
    turns.push({ role: 'assistant', content: `${seller} accepted your deal for ${Number(deal.dealAmountUsdc)} USDC. Pay it into escrow when you are ready.`, actions: [card] });
  }
  return turns;
}
