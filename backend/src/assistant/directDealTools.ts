import { tool } from 'ai';
import { z } from 'zod';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import { findProfileByHandle, getProfile } from '../db/profiles.js';
import { findWhatsappAccountByAddress, getWhatsappAccount } from '../db/whatsapp.js';
import { logger } from '../logger.js';
import { hashNumber } from '../whatsapp/identity.js';
import { messageNumber } from '../whatsapp/sender.js';
import { confirmNonce, hasEquivalentConfirm, type AssistantAction, type ConfirmAction } from './actions.js';

/// A protected deal with someone the person already knows, started and paid
/// from chat. Only WhatsApp accounts get these; the app has its own deal form.
export function directDealTools(address: string, actions: AssistantAction[]) {
  const push = (card: ConfirmAction) => {
    if (!hasEquivalentConfirm(actions, card)) actions.push(card);
  };
  const isChat = async () => !!(await findWhatsappAccountByAddress(address));

  async function resolveSeller(who: string): Promise<{ address: string; label: string } | { number: string } | null> {
    const trimmed = who.trim();
    if (/^\+?[\d\s-]{7,20}$/.test(trimmed)) {
      const digits = trimmed.replace(/\D/g, '');
      const pepper = config.CHAT_NUMBER_PEPPER;
      const account = pepper ? await getWhatsappAccount(hashNumber(digits, pepper)) : null;
      if (account?.address && account.activated) {
        const profile = await getProfile(account.address).catch(() => null);
        return { address: account.address, label: profile?.displayName?.trim() || 'your contact' };
      }
      return { number: digits };
    }
    const profile = await findProfileByHandle(trimmed.replace(/^@/, '')).catch(() => null);
    return profile ? { address: profile.address.toLowerCase(), label: profile.displayName?.trim() || `@${profile.handle}` } : null;
  }

  return {
    start_protected_deal: tool({
      description:
        "Start a protected deal with someone the user already knows, by Karwan tag or WhatsApp number: the amount, what it is for and the days to deliver. Shows a Confirm card; on Confirm the seller is asked to accept, and the user pays into escrow after that. If the person is not on Karwan yet, they get an invitation instead.",
      inputSchema: z.object({
        who: z.string().min(2).max(40).describe('Karwan tag like @ada, or a WhatsApp number with country code.'),
        amountUsdc: z.number().positive().max(1_000),
        what: z.string().min(3).max(400).describe('What the deal is for, in the words both sides agreed.'),
        deadlineDays: z.number().int().min(1).max(180),
      }),
      execute: async ({ who, amountUsdc, what, deadlineDays }) => {
        if (!(await isChat())) return { error: 'Use the deal form in the app for this.' };
        try {
          const seller = await resolveSeller(who);
          if (!seller) return { error: `No Karwan account matches ${who}.` };
          if ('number' in seller) {
            const me = (await getProfile(address).catch(() => null))?.displayName?.trim() || 'Someone';
            await messageNumber(seller.number, {
              kind: 'template',
              name: 'deal_update',
              params: [`${me} wants to start a protected deal with you for ${amountUsdc} USDC: ${what.slice(0, 80)}`],
            });
            return { invited: true, note: 'They are not on Karwan yet. They got an invitation; start the deal again once they join.' };
          }
          if (seller.address === address.toLowerCase()) return { error: 'A deal needs another person.' };
          push({
            kind: 'confirm',
            id: `create_direct_deal:${seller.address}:${confirmNonce()}`,
            intent: 'create_direct_deal',
            title: `Start a protected deal with ${seller.label}`,
            summary: 'They are asked to accept these terms. Nothing is paid until you confirm payment after that.',
            fields: [
              { label: 'With', value: seller.label },
              { label: 'Amount', value: `${amountUsdc} USDC` },
              { label: 'For', value: what },
              { label: 'Deliver within', value: `${deadlineDays} days` },
            ],
            payload: { buyerAddress: address, sellerAddress: seller.address, dealAmountUsdc: amountUsdc, terms: what, deadlineDays },
            confirmLabel: 'Send the deal',
            cancelLabel: 'Not now',
          });
          return { ok: true, shown: 'deal card' };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant start_protected_deal failed');
          return { error: 'Could not prepare that deal right now.' };
        }
      },
    }),

    pay_into_escrow: tool({
      description:
        "Pay the buyer's accepted direct deal into escrow from their buying balance. Only after the seller accepted the terms. Shows a Confirm card with the amount; the money stays in escrow until the buyer releases it.",
      inputSchema: z.object({ jobId: z.string().min(10).max(80) }),
      execute: async ({ jobId }) => {
        if (!(await isChat())) return { error: 'Pay from the deal page in the app.' };
        const deal = await getDeal(jobId).catch(() => null);
        if (!deal || deal.buyer.toLowerCase() !== address.toLowerCase()) return { error: 'No deal of yours with that id.' };
        if (deal.acceptedAt || deal.fundTxHash) return { error: 'That deal is already paid into escrow.' };
        if (deal.cancelledAt) return { error: 'That deal was cancelled.' };
        if (!deal.sellerApprovedAt) return { error: 'The seller has not accepted the terms yet.' };
        const amountUsdc = Number(deal.dealAmountUsdc);
        const sellerLabel = (await getProfile(deal.seller).catch(() => null))?.displayName?.trim() || 'the seller';
        push({
          kind: 'confirm',
          id: `fund_direct_deal:${jobId}:${confirmNonce()}`,
          intent: 'fund_direct_deal',
          title: `Pay ${amountUsdc} USDC into escrow`,
          summary: `For your deal with ${sellerLabel}. It stays in escrow until you release it.`,
          warning: 'This moves money from your buying balance into escrow on Arc. Escrow on Arc mainnet is in beta, up to 1,000 USDC per deal.',
          fields: [
            { label: 'To escrow', value: `${amountUsdc} USDC, plus the fee shown at payment` },
            { label: 'Seller', value: sellerLabel },
          ],
          payload: { jobId, caller: address, seller: deal.seller, amountUsdc },
          confirmLabel: `Pay ${amountUsdc} USDC`,
          cancelLabel: 'Not now',
        });
        return { ok: true, shown: 'payment card' };
      },
    }),
  };
}
