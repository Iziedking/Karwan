import type { DirectDeal, FactoringOffer } from '@/core/api';
import { financingVisible } from '@/shared/deals/financingEligibility';

/// What the deal page's Get paid now shows (view 18). On the escrow family a
/// business order asks from acceptance; once the seller takes an offer from a
/// financier who pays from their own wallet, the others wait on that payment.
export interface GetPaidNowView {
  canAsk: boolean;
  offers: Array<{ id: string; nowUsdc: string; backUsdc: string; holdUsdc?: string; gapUsdc?: string; recommended: boolean; funded: boolean }>;
  waiting?: { offerId: string; deadline: number };
}

export function getPaidNowView(i: { deal: DirectDeal; viewerIsSeller: boolean; offers: FactoringOffer[]; now: number }): GetPaidNowView {
  const live = financingVisible(i.deal, i.viewerIsSeller) && i.deal.escrowVersion === 'suite' && !i.deal.factoringOfferId;
  const waiting = i.offers.find((o) => o.waitingForFinancier && o.sellerDeadline && o.sellerDeadline > i.now);
  if (waiting) return { canAsk: false, offers: [], waiting: { offerId: waiting.id, deadline: waiting.sellerDeadline! } };
  return {
    canAsk: live,
    offers: live
      ? i.offers
          .filter((o) => o.status === 'offered' && i.now < o.expiresAt)
          .map((o) => ({
            id: o.id,
            nowUsdc: o.offeredAdvanceUsdc,
            backUsdc: o.expectedReturnUsdc,
            ...(o.holdUsdc ? { holdUsdc: o.holdUsdc } : {}),
            ...(o.gapUsdc ? { gapUsdc: o.gapUsdc } : {}),
            recommended: !!o.recommended,
            funded: o.funded !== false,
          }))
      : [],
  };
}

/// Who deposits a short deal guarantee before an offer is taken. Karwan does it
/// for a wallet it holds; a person's own wallet signs the deposit itself, since
/// the server cannot move money from it.
export function takePlan(offer: { gapUsdc?: string }, method: 'circle' | 'web3' | null): { karwanDeposits?: true; walletDeposits?: string } {
  if (!offer.gapUsdc || !(Number(offer.gapUsdc) > 0)) return {};
  return method === 'circle' ? { karwanDeposits: true } : { walletDeposits: offer.gapUsdc };
}
