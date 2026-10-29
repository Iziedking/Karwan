import { tool } from 'ai';
import { z } from 'zod';
import type { AssistantAction } from './actions.js';
import {
  buildAcceptOfferConfirm,
  buildApplyConfirm,
  buildAskConfirm,
  buildFinancierOfferConfirm,
  buildPaySellerConfirm,
  buildRejectOfferConfirm,
  buildStopAskingConfirm,
  type FinanceDeal,
  type FinanceOffer,
  type FinanceSigner,
  type FinancierLine,
  type FundableRequest,
} from './finance.js';

/// Getting paid early from any channel (view 31, phase B). Reads go through the
/// app's own routes as the person, so ranking, scoping and the escrow read are
/// the pages' own; deal eligibility uses the same functions the routes use.

type Call = (address: string, method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;

export interface FinanceToolDeps {
  call: Call;
  getDeal: (jobId: string) => Promise<FinanceDeal | null>;
  isFactorable: (deal: FinanceDeal) => boolean;
  claimable: (jobId: string) => Promise<string | null>;
  getOffer: (offerId: string) => Promise<{ invoiceId: string; seller: string } | null>;
  eligibility: (address: string) => Promise<{ eligible: boolean; reasons: string[] }>;
  financierStatus: (address: string) => Promise<string>;
  now: () => number;
}

const JOB = z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe('The deal id (0x and 64 hex characters), from list_my_deals.');
const OFFER = z.string().uuid().describe('The offer id, from list_early_payment_offers.');

export function financeTools(address: string, signer: FinanceSigner, actions: AssistantAction[], deps: FinanceToolDeps) {
  const show = (card: AssistantAction | { error: string }) => {
    if ('error' in card) return card;
    if (!actions.some((a) => a.id === card.id)) actions.push(card);
    return { ok: true, shown: 'title' in card ? card.title : '' };
  };

  /// The seller's ranked offers on a deal, as the deal page shows them.
  const sellerOffers = async (jobId: string): Promise<FinanceOffer[] | { error: string }> => {
    const r = await deps.call(address, 'GET', `/api/factoring/offers/${jobId}`);
    if (r.status !== 200) return { error: typeof r.json.error === 'string' ? r.json.error : 'Could not read the offers just now.' };
    return (r.json.offers as FinanceOffer[] | undefined) ?? [];
  };

  return {
    propose_get_paid_early: tool({
      description:
        "Prepare a card for the seller of a delivered business order to ask to be paid early: financiers then make offers, and nothing moves until the seller takes one. Use for 'get paid now', 'can I be paid early', 'I need the money before the buyer releases'. Leave amountUsdc out to ask for all that is still to be paid.",
      inputSchema: z.object({
        jobId: JOB,
        amountUsdc: z.number().positive().max(10_000_000).optional().describe('How much of what is still to be paid they offer to a financier.'),
        leastUsdc: z.number().positive().max(10_000_000).optional().describe('The least they would take now; offers below it are refused.'),
      }),
      execute: async ({ jobId, amountUsdc, leastUsdc }) => {
        const deal = await deps.getDeal(jobId);
        if (!deal) return { error: 'No deal with that id.' };
        const factorable = deps.isFactorable(deal);
        return show(
          buildAskConfirm({
            deal,
            me: address,
            factorable,
            claimableUsdc: factorable ? await deps.claimable(jobId) : '0',
            ...(amountUsdc !== undefined ? { amountUsdc } : {}),
            ...(leastUsdc !== undefined ? { leastUsdc } : {}),
          }),
        );
      },
    }),

    list_early_payment_offers: tool({
      description:
        "The financiers' offers to pay the seller early on one of their deals, ranked as the deal page ranks them: payable now, then the financier's reputation, then price, the best marked recommended. Use before proposing to take or turn one down. Never invent a rate.",
      inputSchema: z.object({ jobId: JOB }),
      execute: async ({ jobId }) => {
        const offers = await sellerOffers(jobId);
        if ('error' in offers) return offers;
        const now = deps.now();
        const open = offers.filter((o) => o.status === 'offered' && now < o.expiresAt && o.seller.toLowerCase() === address.toLowerCase());
        return {
          offers: open.map((o) => ({
            offerId: o.id,
            paidNowUsdc: o.offeredAdvanceUsdc,
            repaidToFinancierUsdc: o.expectedReturnUsdc,
            recommended: !!o.recommended,
            financierReady: o.funded !== false,
            expiresAt: new Date(o.expiresAt).toISOString(),
          })),
          note: open.length ? 'Name offers by what they pay now and what the financier is repaid. Say which is recommended.' : 'No open offers yet. Financiers see the request once the seller asks.',
        };
      },
    }),

    propose_take_early_payment: tool({
      description: "Prepare a card for the seller to take a financier's offer and be paid now. The financier is repaid first from the escrow when the buyer releases payment.",
      inputSchema: z.object({ offerId: OFFER }),
      execute: async ({ offerId }) => {
        const stored = await deps.getOffer(offerId);
        if (!stored) return { error: 'No offer with that id.' };
        const offers = await sellerOffers(stored.invoiceId);
        if ('error' in offers) return offers;
        const o = offers.find((x) => x.id === offerId);
        if (!o) return { error: 'Only the seller this offer was made to can answer it.' };
        return show(buildAcceptOfferConfirm({ offer: o, me: address, nowMs: deps.now() }));
      },
    }),

    propose_turn_down_early_payment: tool({
      description: "Prepare a card for the seller to turn down one financier's offer. Their other offers stay open.",
      inputSchema: z.object({ offerId: OFFER }),
      execute: async ({ offerId }) => {
        const stored = await deps.getOffer(offerId);
        if (!stored) return { error: 'No offer with that id.' };
        const offers = await sellerOffers(stored.invoiceId);
        if ('error' in offers) return offers;
        const o = offers.find((x) => x.id === offerId);
        if (!o) return { error: 'Only the seller this offer was made to can answer it.' };
        return show(buildRejectOfferConfirm({ offer: o, me: address, nowMs: deps.now() }));
      },
    }),

    propose_stop_asking_early_payment: tool({
      description: 'Prepare a card for the seller to stop asking to be paid early on a deal, so financiers no longer see it.',
      inputSchema: z.object({ jobId: JOB }),
      execute: async ({ jobId }) => {
        const deal = await deps.getDeal(jobId);
        if (!deal) return { error: 'No deal with that id.' };
        return show(buildStopAskingConfirm({ deal, me: address }));
      },
    }),

    list_requests_i_can_fund: tool({
      description:
        "For a financier: the sellers asking to be paid early that they may fund, with what each deal can still pay, what the seller asks and the least they take. A deal's own buyer or seller never sees it. Use for 'what can I finance', 'any invoices to fund'.",
      inputSchema: z.object({}),
      execute: async () => {
        const r = await deps.call(address, 'GET', '/api/factoring/available');
        if (r.status === 403) return { error: 'They are not a financier yet. Offer propose_apply_as_financier.' };
        if (r.status !== 200) return { error: 'Could not read the financier desk just now.' };
        const deals = (r.json.deals as Array<FundableRequest & { sellerTier?: string; counterpartyCompany?: { sector?: string; region?: string } }>) ?? [];
        return {
          requests: deals.map((d) => ({
            jobId: d.jobId,
            dealTotalUsdc: d.dealAmountUsdc,
            stillToBePaidUsdc: d.claimableUsdc,
            sellerAsksUsdc: d.factoringRequestedAdvanceUsdc ?? d.claimableUsdc,
            leastSellerTakesUsdc: d.factoringMinAdvanceUsdc ?? null,
            sellerTier: d.sellerTier ?? null,
          })),
        };
      },
    }),

    propose_pay_the_seller: tool({
      description:
        "For a financier with their own wallet: prepare the card to pay a seller who took their offer. The seller's signatures last 24 hours from the moment they took it; after that nothing is held and nothing moved. Use for 'pay the seller', 'the seller took my offer'.",
      inputSchema: z.object({ offerId: OFFER }),
      execute: async ({ offerId }) => {
        const r = await deps.call(address, 'GET', '/api/factoring/mine');
        if (r.status !== 200) return { error: 'Could not read their offers just now.' };
        const line = ((r.json.asFinancier as FinancierLine[] | undefined) ?? []).find((o) => o.id === offerId);
        if (!line) return { error: 'Only the financier who made this offer can pay it.' };
        return show(buildPaySellerConfirm({ line, me: address, nowMs: deps.now() }));
      },
    }),

    propose_early_payment_offer: tool({
      description:
        "For a financier: prepare a card offering to pay a seller early on one request from list_requests_i_can_fund, at a discount. The card shows what they pay now and are repaid, and refuses before anything moves if their wallet does not hold the advance.",
      inputSchema: z.object({
        jobId: JOB,
        discountPercent: z.number().min(0.1).max(50).describe('The discount off what the financier is repaid, in percent.'),
      }),
      execute: async ({ jobId, discountPercent }) => {
        const r = await deps.call(address, 'GET', '/api/factoring/available');
        if (r.status === 403) return { error: 'They are not a financier yet. Offer propose_apply_as_financier.' };
        if (r.status !== 200) return { error: 'Could not read the financier desk just now.' };
        const request = ((r.json.deals as FundableRequest[]) ?? []).find((d) => d.jobId.toLowerCase() === jobId.toLowerCase());
        if (!request) return { error: 'That request is not open to them: the seller stopped asking, it was paid, or they are part of the deal.' };
        const wallet = await deps.call(address, 'GET', '/api/factoring/funding?advanceUsdc=0');
        return show(
          buildFinancierOfferConfirm({
            request,
            discountPercent,
            walletUsdc: wallet.status === 200 && typeof wallet.json.walletUsdc === 'string' ? wallet.json.walletUsdc : null,
            signer,
          }),
        );
      },
    }),

    propose_apply_as_financier: tool({
      description: "Prepare a card to apply to finance deals (pay sellers early and be repaid from the escrow). Says plainly what is missing when they do not meet the bar yet.",
      inputSchema: z.object({}),
      execute: async () => {
        const [status, eligibility] = await Promise.all([deps.financierStatus(address), deps.eligibility(address)]);
        return show(buildApplyConfirm({ status, eligible: eligibility.eligible, reasons: eligibility.reasons }));
      },
    }),

    message_about_early_payment: tool({
      description:
        "Send a message in the private conversation between a seller and a financier about one early-payment offer they share. Use when either asks to tell the other something about it. The message is sent as written; never put a code or a secret in it.",
      inputSchema: z.object({ offerId: OFFER, text: z.string().min(1).max(2000) }),
      execute: async ({ offerId, text }) => {
        const r = await deps.call(address, 'POST', `/api/financing-chat/factoring/${offerId}`, { body: text });
        if (r.status >= 400) return { sent: false, error: typeof r.json.error === 'string' ? r.json.error : 'It did not send.' };
        return { sent: true };
      },
    }),
  };
}
