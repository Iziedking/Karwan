import { MAX_REVIEW_DAYS } from '../deals/reviewClock.js';
import { tool } from 'ai';
import { z } from 'zod';
import { formatUnits, parseUnits } from 'viem';
import { config } from '../config.js';
import { getUserByAddress } from '../db/users.js';
import { computeFunding, getEscrowFeeBps } from '../chain/contracts.js';
import { getDeal, type DirectDeal } from '../db/deals.js';
import { findProfileByHandle, getProfile } from '../db/profiles.js';
import { getWhatsappAccount } from '../db/whatsapp.js';
import { logger } from '../logger.js';
import { hashNumber } from '../channels/identity.js';
import { messageNumber } from '../channels/sender.js';
import { confirmNonce, hasEquivalentConfirm, type AssistantAction, type ConfirmAction } from './actions.js';
import { conversationReference, dealBody, dealCardFields, type Counterparty } from './dealDraft.js';
import { personName, shortAddress } from '../channels/personName.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';
import { recordSetupCard } from './recordCard.js';

const USDC_DECIMALS = 6;

export type FeeBps = () => Promise<number>;

/// What the buyer pays into escrow for this amount: the deal plus their half of the fee.
async function buyerPays(amountUsdc: number | string, feeBps: FeeBps): Promise<string> {
  const { fundedAmount } = computeFunding(parseUnits(String(amountUsdc), USDC_DECIMALS), await feeBps());
  return formatUnits(fundedAmount, USDC_DECIMALS);
}

/// The card that pays an accepted deal into escrow. Built in one place for the
/// assistant's tool, a reopened web conversation and the chat push when the
/// seller accepts (view 24), so all three show the same total.
export async function payCardFor(deal: DirectDeal, address: string, feeBps: FeeBps = getEscrowFeeBps): Promise<ConfirmAction | { error: string }> {
  if (deal.buyer.toLowerCase() !== address.toLowerCase()) return { error: 'No deal of yours with that id.' };
  if (deal.acceptedAt || deal.fundTxHash) return { error: 'That deal is already paid into escrow.' };
  if (deal.cancelledAt) return { error: 'That deal was cancelled.' };
  if (!deal.sellerApprovedAt) return { error: 'The seller has not accepted the terms yet.' };
  const amountUsdc = Number(deal.dealAmountUsdc);
  const total = await buyerPays(deal.dealAmountUsdc, feeBps).catch(() => null);
  if (!total) return { error: 'The fee could not be read right now. Open the deal to pay.' };
  const sellerLabel = personName(await getProfile(deal.seller).catch(() => null), 'the seller');
  return {
    kind: 'confirm',
    id: `fund_direct_deal:${deal.jobId}:${confirmNonce()}`,
    intent: 'fund_direct_deal',
    title: `Pay ${total} USDC into escrow`,
    summary: `${sellerLabel} accepted your deal. It stays in escrow until you release it.`,
    warning: 'This moves money from your buying balance into escrow on Arc. Escrow on Arc mainnet is in beta, up to 1,000 USDC per deal.',
    fields: [
      { label: 'Deal', value: `${amountUsdc} USDC` },
      { label: 'You pay, with the fee', value: `${total} USDC` },
      { label: 'Seller', value: sellerLabel },
    ],
    payload: { jobId: deal.jobId, caller: address, seller: deal.seller, amountUsdc, maxFundedAmountUsdc: total },
    confirmLabel: `Pay ${total} USDC`,
    cancelLabel: 'Not now',
  };
}

/// A protected deal, built and paid from the assistant on the website and in
/// every chat channel (view 24). Every field the deal form has can be answered
/// in conversation; sending the deal is one card, paying it is another.
export function directDealTools(address: string, actions: AssistantAction[], conversationId?: string, feeBps: FeeBps = getEscrowFeeBps) {
  const push = (card: ConfirmAction) => {
    // A changed draft replaces the card it changes, never sits beside it.
    for (let i = actions.length - 1; i >= 0; i--) {
      const a = actions[i]!;
      if (a.kind === 'confirm' && a.intent === card.intent && card.intent === 'create_direct_deal') actions.splice(i, 1);
    }
    if (!hasEquivalentConfirm(actions, card)) actions.push(card);
  };

  async function resolveSeller(who: string): Promise<{ party: Counterparty; label: string } | { number: string } | null> {
    const trimmed = who.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      const profile = await getProfile(trimmed.toLowerCase()).catch(() => null);
      return { party: { sellerAddress: trimmed.toLowerCase() }, label: personName(profile, shortAddress(trimmed)) };
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { party: { sellerEmail: trimmed.toLowerCase() }, label: trimmed.toLowerCase() };
    if (/^\+?[\d\s-]{7,20}$/.test(trimmed)) {
      const digits = trimmed.replace(/\D/g, '');
      const pepper = config.CHAT_NUMBER_PEPPER;
      const account = pepper ? await getWhatsappAccount(hashNumber(digits, pepper)) : null;
      if (account?.address && account.activated) {
        const profile = await getProfile(account.address).catch(() => null);
        return { party: { sellerAddress: account.address.toLowerCase() }, label: personName(profile, 'your contact') };
      }
      return { number: digits };
    }
    const profile = await findProfileByHandle(trimmed.replace(/^@/, '')).catch(() => null);
    if (!profile) return null;
    const name = profile.displayName?.trim();
    return { party: { sellerAddress: profile.address.toLowerCase() }, label: name ? `${name} · @${profile.handle}` : `@${profile.handle}` };
  }

  return {
    start_protected_deal: tool({
      description:
        "Build a protected deal with someone the user names (Karwan tag, email or wallet address) and show one card with every term; on Confirm the deal is sent and the seller is asked to accept. No money moves until they accept and the user confirms payment with pay_into_escrow. Call it as soon as the user names the person, even before the terms are known: it checks who they are and returns what is still missing. Ask only for what is missing, one short question at a time: what it is for, the amount, and when it is due. Then say the defaults in one line (one payment on delivery, 24 hours for them to accept) and ask if they want to change any, split the payment, require stake, or add goods terms. Never guess an answer the user did not give. For a calendar date pass deliverBy and never convert it yourself. If the user changes a term, call this again; the new card replaces the old one.",
      inputSchema: z.object({
        who: z.string().min(2).max(120).describe('Karwan tag like @ada, an email, or a 0x wallet address.'),
        what: z.string().min(3).max(4000).optional().describe('What the deal is for, in the words both sides agreed.'),
        amountUsdc: z.number().positive().max(1_000_000).optional(),
        deliverInDays: z.number().int().min(1).max(180).optional(),
        deliverBy: z.string().max(10).optional().describe('Due date as YYYY-MM-DD when the user gave a date.'),
        payments: z.array(z.number().int().min(1).max(100)).min(1).max(5).optional().describe('Payment parts in percent, adding to 100, e.g. [50, 50]. Omit for one payment.'),
        reviewDays: z.number().int().min(1).max(MAX_REVIEW_DAYS).optional().describe('Days the buyer has to check each delivery, only if the user set it.'),
        acceptWithinHours: z.number().min(0.25).max(720).optional().describe('Hours the seller has to accept. Omit for the default 24.'),
        tradeType: z.enum(['service', 'goods', 'mixed']).optional(),
        incoterms: z.enum(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']).optional().describe('Goods only.'),
        paymentTerms: z.enum(['immediate', 'net30', 'net60', 'net90']).optional().describe('Goods only.'),
        company: z.object({ name: z.string().max(120).optional(), sector: z.string().max(40).optional(), region: z.string().max(80).optional() }).optional().describe("Goods only: the seller's company."),
        stakePct: z.number().int().min(50).max(100).optional().describe('Only when the user wants the seller to back the deal with stake.'),
        evidenceRequired: z.boolean().optional(),
        personCheck: z.boolean().optional().describe('True only when the user wants the seller to pass the person check.'),
      }),
      execute: async ({ who, what, amountUsdc, ...rest }) => {
        try {
          const seller = await resolveSeller(who);
          if (!seller) return { error: `No Karwan account matches ${who}. Ask for their Karwan tag, email or wallet address.` };
          const missing = [...(what ? [] : ['what']), ...(amountUsdc ? [] : ['amountUsdc'])];
          if (missing.length) {
            if ('number' in seller) return { ok: true, seller: 'a phone number', missing };
            if ('sellerAddress' in seller.party && seller.party.sellerAddress === address.toLowerCase()) return { error: 'A deal needs another person.' };
            return { ok: true, seller: seller.label, missing };
          }
          const answers = { ...rest, what: what!, amountUsdc: amountUsdc! };
          if ('number' in seller) {
            const me = personName(await getProfile(address).catch(() => null), 'Someone');
            const invited = await messageNumber(seller.number, {
              kind: 'template',
              name: 'deal_update',
              params: [`${me} wants to start a protected deal with you for ${answers.amountUsdc} USDC: ${answers.what.slice(0, 80)}`],
            });
            if (!invited) return { error: 'I can only find people here by their Karwan tag, email or wallet address. Ask them for one.' };
            return { invited: true, note: 'They are not on Karwan yet. They got an invitation; start the deal again once they join.' };
          }
          if ('sellerAddress' in seller.party && seller.party.sellerAddress === address.toLowerCase()) return { error: 'A deal needs another person.' };
          const built = dealBody(address, seller.party, answers, Date.now());
          if (!built.ok) return { error: built.message };
          if (conversationId) built.body.sourceContext = { channel: 'karwan', reference: conversationReference(conversationId) };
          push({
            kind: 'confirm',
            id: `create_direct_deal:${'sellerAddress' in seller.party ? seller.party.sellerAddress : seller.party.sellerEmail}:${confirmNonce()}`,
            intent: 'create_direct_deal',
            title: `Send a protected deal to ${seller.label}`,
            summary: 'They are asked to accept these terms. Nothing is paid until they accept and you confirm payment.',
            fields: dealCardFields(built.body, seller.label, await buyerPays(built.body.dealAmountUsdc, feeBps).catch(() => null)),
            payload: built.body,
            confirmLabel: 'Send the deal',
            cancelLabel: 'Not now',
          });
          return { ok: true, shown: 'deal card', terms: built.body };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant start_protected_deal failed');
          return { error: 'Could not prepare that deal right now.' };
        }
      },
    }),

    set_up_record: tool({
      description:
        "Set up the person's Karwan record before their first payment or their first accepted deal on the new escrow, or renew their buying agent after its year. Use when a deal step answers record_setup_needed or agent_renewal_needed, or when they ask. Shows one card with the limits; they confirm it is them on Karwan. Moves no money.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!suiteIdentity) return { error: 'Records are not open on this network yet. Deals here run as before.' };
        try {
          const status = await suiteIdentity.identityStatus(address);
          const card = recordSetupCard(address, status, Math.floor(Date.now() / 1000), {
            gasPolicy: config.CIRCLE_ARC_GAS_POLICY,
            karwanHoldsWallet: !!getUserByAddress(address)?.circleIdentityWalletId,
          });
          if (!card) return { ok: true, complete: true, note: 'Your Karwan record is already set up.' };
          push(card);
          return { ok: true, shown: 'record card' };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant set_up_record failed');
          return { error: 'Could not read your record right now.' };
        }
      },
    }),

    pay_into_escrow: tool({
      description:
        "Pay the buyer's accepted protected deal into escrow from their buying balance. Only after the seller accepted the terms. Shows a Confirm card with the exact total, fee included; the money stays in escrow until the buyer releases it.",
      inputSchema: z.object({ jobId: z.string().min(10).max(80) }),
      execute: async ({ jobId }) => {
        const deal = await getDeal(jobId).catch(() => null);
        if (!deal) return { error: 'No deal of yours with that id.' };
        const card = await payCardFor(deal, address, feeBps);
        if ('error' in card) return card;
        push(card);
        return { ok: true, shown: 'payment card' };
      },
    }),
  };
}
