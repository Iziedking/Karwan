/// Stage 0 + 1 of the chat-native transaction surface: the AUTHENTICATED
/// assistant. When a signed-in user chats, the assistant runs a tool-calling
/// loop that can read THEIR OWN data (wallet balance, their deals, a deal's
/// status, a plain explanation of an error they hit) and answer from real
/// numbers instead of guessing. It is READ-ONLY: no tool moves money, funds,
/// releases, cancels, or changes anything. Money-moving actions are a later,
/// confirm-gated stage.
///
/// PRIVACY: every tool is bound to the caller's cryptographically-verified
/// session address (passed in by the route, never a client param) and reads only
/// that address's data. get_deal_status additionally enforces deal party
/// membership, so a jobId the user isn't part of returns an error, not data. The
/// loop runs on `assistantAgentModel` (direct Anthropic ONLY, no Conduit /
/// OpenRouter) because the prompt + tool results carry private account data. When
/// that model is absent the caller falls back to the anonymous, knowledge-only
/// provider chain, which never sees private data — never to a proxy for this input.

import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { formatUnits, parseUnits, type Address } from 'viem';
import { assistantAgentModel } from '../llm/client.js';
import { withLlmTimeout } from '../agents/llm-utils.js';
import { KARWAN_ASSISTANT_SYSTEM } from './knowledge.js';
import { readUsdcBalance, readEscrow } from '../chain/contracts.js';
import { arcTestnet, publicClient } from '../chain/client.js';
import { listDealsForAddress, getDeal, type DirectDeal } from '../db/deals.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { resolveSellerProfile } from '../agents/agent-registry.js';
import { diagnoseUserError } from '../llm/supervisor.js';
import {
  buildNavigateAction,
  buildPostOfferConfirm,
  buildReleaseConfirm,
  buildWithdrawConfirm,
  buildCashOutConfirm,
  NAVIGATE_DESTINATIONS,
  type AssistantAction,
} from './actions.js';

/// Friendly chain names the model may pick for a cash-out, mapped to the CCTP
/// chain keys the bridge-out route expects. Testnet keys because Karwan is on Arc
/// Testnet. Kept to the well-supported set (mirrors CircleBridgeChainKey).
const CASH_OUT_CHAINS: Record<string, { key: string; label: string }> = {
  base: { key: 'baseSepolia', label: 'Base' },
  arbitrum: { key: 'arbitrumSepolia', label: 'Arbitrum' },
  optimism: { key: 'optimismSepolia', label: 'Optimism' },
  ethereum: { key: 'sepolia', label: 'Ethereum' },
  polygon: { key: 'polygonAmoy', label: 'Polygon' },
};
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;
const NATIVE_DECIMALS = arcTestnet.nativeCurrency.decimals;

/// Whether the authenticated tool-calling assistant can run. False when no
/// Anthropic key is set (privacy boundary: this path is direct-Anthropic-only).
export function assistantAgentEnabled(): boolean {
  return assistantAgentModel !== null;
}

export type AssistantChatMessage = { role: 'user' | 'assistant'; content: string };

// --- deal shaping -----------------------------------------------------------

/// Party gate for a single deal: only the buyer or the seller may see it. The
/// viewer address must already be lowercased (the session address always is).
/// This is the privacy boundary for get_deal_status — a jobId the caller isn't
/// part of returns an error, never data.
export function canViewDeal(deal: Pick<DirectDeal, 'buyer' | 'seller'>, viewer: string): boolean {
  return deal.buyer === viewer || deal.seller === viewer;
}

/// A short, human phase for a deal, derived from its lifecycle fields in the same
/// priority order the deal page uses: terminal states first, then in-flight.
export function dealPhase(deal: DirectDeal): string {
  if (deal.cancelledAt) return `cancelled${deal.cancelKind ? ` (${deal.cancelKind})` : ''}`;
  if (deal.settledAt) return 'settled';
  if (deal.disputed) return 'in dispute';
  if (deal.delivered && !deal.settledAt) return 'delivered, awaiting your release';
  if (deal.pendingCounterparty) return 'waiting for the invited counterparty to join';
  if (!deal.acceptedAt) return 'waiting for the seller to accept';
  return 'in progress, awaiting delivery';
}

/// A compact, viewer-relative view of a deal. `role` and `counterparty` are from
/// the caller's side; amounts stay in USDC. Nothing internal (agent wallet ids,
/// tx hashes, other parties' private notes) is exposed.
export function summarizeDeal(deal: DirectDeal, viewer: string): Record<string, unknown> {
  const isBuyer = deal.buyer === viewer;
  return {
    jobId: deal.jobId,
    role: isBuyer ? 'buyer' : 'seller',
    counterparty: isBuyer ? deal.sellerPaytag ?? deal.seller : deal.buyer,
    amountUsdc: deal.dealAmountUsdc,
    phase: dealPhase(deal),
    deadline: deal.deadlineUnix ? new Date(deal.deadlineUnix * 1000).toISOString() : null,
    releasePaused: deal.releaseBlockedReason ?? null,
  };
}

// --- tools ------------------------------------------------------------------

/// Build the tool set bound to one caller. Read tools read only `address`'s own
/// data; `propose_navigation` pushes a validated navigate action into `actions`.
/// Tools return plain objects (including `{ error }`) rather than throwing, so the
/// model can explain a failure to the user instead of the loop aborting.
function buildTools(address: string, method: string, actions: AssistantAction[]) {
  return {
    get_my_balance: tool({
      description:
        "Read the signed-in user's own wallet balance on Arc testnet: their USDC and their native gas balance. Use this whenever they ask what their balance is, how much USDC they have, or whether they can afford something. Never guess a balance.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const [usdc, gas] = await Promise.all([
            readUsdcBalance(address),
            publicClient.getBalance({ address: address as Address }),
          ]);
          return {
            address,
            usdc: formatUnits(usdc, USDC_DECIMALS),
            gas: formatUnits(gas, NATIVE_DECIMALS),
            note: 'This is the wallet you sign in with. Proceeds from deals you sell land in your seller agent wallet on the Profile, not here.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_my_balance failed');
          return { error: 'Could not read the balance from the chain right now. Try again shortly.' };
        }
      },
    }),

    list_my_deals: tool({
      description:
        "List the signed-in user's own deals (both the ones they buy and the ones they sell), most useful for 'what deals do I have', 'what's open', or 'show my trades'. Returns a compact list; use get_deal_status for the full picture of one deal.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const deals = await listDealsForAddress(address);
          if (deals.length === 0) {
            return { deals: [], note: 'You have no deals yet.' };
          }
          return { count: deals.length, deals: deals.map((d) => summarizeDeal(d, address)) };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant list_my_deals failed');
          return { error: 'Could not load your deals right now. Try again shortly.' };
        }
      },
    }),

    get_deal_status: tool({
      description:
        "Get the full status of ONE of the signed-in user's own deals by its jobId: phase, amount, counterparty, deadline, and whether a release is paused. Only works for a deal the user is a party to.",
      inputSchema: z.object({
        jobId: z.string().min(1).max(120).describe('The deal id (jobId) to look up.'),
      }),
      execute: async ({ jobId }) => {
        try {
          const deal = await getDeal(jobId);
          if (!deal) return { error: `No deal found with id ${jobId}.` };
          // Party gate: the caller must be the buyer or the seller on this deal.
          if (!canViewDeal(deal, address)) {
            return { error: 'That deal is not one of yours, so I cannot show its details.' };
          }
          return { deal: summarizeDeal(deal, address) };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_deal_status failed');
          return { error: 'Could not read that deal right now. Try again shortly.' };
        }
      },
    }),

    explain_error: tool({
      description:
        'Turn a cryptic error the user hit into a plain-language explanation with a next step. Pass the short action they were doing (e.g. "release", "fund", "bridge") and the raw error text they saw.',
      inputSchema: z.object({
        action: z.string().min(1).max(40).describe('Short label for what they were doing.'),
        errorMessage: z.string().min(1).max(1000).describe('The raw error text they saw.'),
      }),
      execute: async ({ action, errorMessage }) => {
        try {
          const d = await diagnoseUserError({ action, errorMessage });
          if (!d) return { error: 'I cannot explain that one right now.' };
          return d;
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant explain_error failed');
          return { error: 'I could not build an explanation right now. Try again shortly.' };
        }
      },
    }),

    propose_navigation: tool({
      description:
        'Show the user a prominent button that takes them straight to the in-app screen for something they want to DO but that you cannot execute yet: add money / top up, open a direct deal, post a request or an offer, withdraw proceeds, get test USDC, open one of their own deals, browse the market, find partners, view a credit passport, or stake. Prefer this over only describing where to go. You may call it more than once. Keep the label short and specific.',
      inputSchema: z.object({
        destination: z.enum(NAVIGATE_DESTINATIONS).describe('Which screen to send them to.'),
        jobId: z.string().max(120).optional().describe('Required for open_deal: the deal id.'),
        address: z
          .string()
          .max(60)
          .optional()
          .describe('Required for credit_passport: the 0x business address.'),
        rail: z
          .enum(['gateway', 'cctp'])
          .optional()
          .describe('Optional for add_money: which top-up rail. Defaults to the pooled Gateway rail.'),
        label: z.string().max(60).optional().describe('Short, specific button text. Defaults to a sensible label.'),
        description: z.string().max(120).optional().describe('Optional one-line hint under the button.'),
      }),
      execute: async (args) => {
        // open_deal only ever links a deal the caller is actually a party to, so
        // the assistant never offers to open someone else's deal.
        if (args.destination === 'open_deal') {
          if (!args.jobId) return { error: 'open_deal needs a jobId.' };
          try {
            const deal = await getDeal(args.jobId);
            if (!deal || !canViewDeal(deal, address)) {
              return { error: 'That deal is not one of yours, so I will not link it.' };
            }
          } catch (err) {
            logger.warn({ err: (err as Error).message }, 'assistant propose_navigation deal check failed');
            return { error: 'Could not verify that deal right now.' };
          }
        }
        const built = buildNavigateAction(args);
        if ('error' in built) return built;
        // Dedup by href so one reply never shows the same button twice.
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.label };
      },
    }),

    propose_post_offer: tool({
      description:
        "Prepare a confirm card to post the user's standing OFFER to supply work or goods (a listing on the marketplace). This does NOT post it: it shows the user a card they must approve, then it posts as themselves. Use it when they clearly want to advertise what they sell and have given a title, a short description, and an asking price in USDC. Nothing moves money and the offer can be cancelled later. Do NOT use this for posting a REQUEST for work they need (that funds an auction) — send them to the request desk with propose_navigation instead.",
      inputSchema: z.object({
        title: z.string().min(3).max(120).describe('Short offer title, e.g. "Arabic-English contract translation".'),
        description: z.string().min(5).max(500).describe('What they supply, plainly. One or two sentences.'),
        askingPriceUsdc: z.number().positive().max(5_000_000).describe('Asking price in USDC.'),
        negotiationMaxDecreasePct: z
          .number()
          .min(0)
          .max(50)
          .optional()
          .describe('Optional: how far, in percent, their agent may auto-negotiate below the asking price.'),
        ttlDays: z.number().min(0.0006).max(90).optional().describe('Optional: how many days the offer stays open. Defaults to 30.'),
      }),
      execute: async (args) => {
        // Pre-flight the SAME preconditions the listings route enforces, so the
        // assistant never shows a confirm card that would 409 on submit. When a
        // precondition is missing, guide the model to send them to set it up.
        const agents = await getAgentWallets(address).catch(() => null);
        if (!agents) {
          return { error: 'They must activate their agent wallets first. Offer a button to their profile (destination "profile").' };
        }
        const sellerProfile = await resolveSellerProfile(agents.sellerAddress).catch(() => null);
        if (!sellerProfile) {
          return { error: 'They need a seller profile first. Offer a button to the seller desk (destination "new_offer").' };
        }
        const built = buildPostOfferConfirm({ caller: address, ...args });
        if ('error' in built) return built;
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_release: tool({
      description:
        "Prepare a confirm card to RELEASE a milestone payment to the seller on one of the buyer's own deals. This pays the seller real USDC from escrow and CANNOT be undone, so it only shows a card the buyer must approve; it never releases on its own. Use it when the buyer clearly wants to pay out, release, or approve a delivery on a specific deal. Only the buyer can release, and only after the seller has marked the work delivered.",
      inputSchema: z.object({
        jobId: z.string().min(1).max(120).describe('The deal id to release the next milestone on.'),
      }),
      execute: async ({ jobId }) => {
        const deal = await getDeal(jobId).catch(() => null);
        if (!deal) return { error: `No deal found with id ${jobId}.` };
        if (deal.buyer !== address) {
          return deal.seller === address
            ? { error: 'Only the buyer can release a payment. On this deal you are the seller, so you receive it, you do not release it.' }
            : { error: 'That deal is not one of yours, so I cannot release it.' };
        }
        if (deal.cancelledAt) return { error: 'That deal was cancelled, so there is nothing to release.' };
        if (deal.settledAt) return { error: 'That deal is already fully settled.' };
        if (deal.disputed) return { error: 'That deal is in dispute, so releasing is paused until it resolves.' };
        if (!deal.delivered) {
          return { error: 'The seller has not marked the work delivered yet, so there is nothing to release. Offer a button to open the deal (destination "open_deal").' };
        }
        if (deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious') {
          return { error: 'Karwan flagged the delivery link and is holding it for review. Release is paused until it clears.' };
        }
        if (!deal.buyerAgentWalletId) {
          return { error: 'This deal has no buyer agent wallet on record, so it cannot be released from here.' };
        }
        let escrow;
        try {
          escrow = await readEscrow(jobId);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant propose_release escrow read failed');
          return { error: "Could not read this deal's escrow right now. Try again shortly." };
        }
        const total = escrow.milestonePcts.length;
        const idx = escrow.milestonesReleased; // next milestone to release, 0-based
        if (total === 0) return { error: "Could not read this deal's milestones. Open the deal to release it." };
        if (idx >= total) return { error: 'Every milestone on this deal is already released.' };
        const pct = escrow.milestonePcts[idx] ?? 0;
        if (pct <= 0) return { error: 'Could not determine the next milestone amount for this deal.' };

        const amountWei = (escrow.dealAmount * BigInt(pct)) / 100n;
        const releasedAfter = escrow.released + amountWei;
        const remainingWei = escrow.dealAmount > releasedAfter ? escrow.dealAmount - releasedAfter : 0n;
        const built = buildReleaseConfirm({
          caller: address,
          jobId,
          counterparty: deal.sellerPaytag ?? deal.seller,
          milestoneNumber: idx + 1,
          totalMilestones: total,
          amountUsdc: formatUnits(amountWei, USDC_DECIMALS),
          remainingUsdc: formatUnits(remainingWei, USDC_DECIMALS),
          isFinal: idx + 1 >= total,
        });
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_withdraw: tool({
      description:
        "Prepare a confirm card to WITHDRAW USDC from one of the user's OWN agent wallets to an external Arc address. Proceeds from deals they SELL land in their seller agent; buyer-side refunds land in their buyer agent. This moves real USDC and cannot be undone, so it only shows a card they must approve. Use it when they clearly want to withdraw or cash out and have given an amount and a destination 0x address.",
      inputSchema: z.object({
        agent: z
          .enum(['buyer', 'seller'])
          .describe('Which agent wallet to withdraw from. Sale proceeds are in the seller agent; buyer refunds in the buyer agent.'),
        toAddress: z.string().min(1).max(60).describe('Destination Arc address, a full 0x-prefixed 20-byte address.'),
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to withdraw.'),
      }),
      execute: async ({ agent, toAddress, amountUsdc }) => {
        const to = toAddress.trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
          return { error: 'That destination is not a valid 0x address. Ask them to paste the full address.' };
        }
        const wallets = await getAgentWallets(address).catch(() => null);
        if (!wallets) {
          return { error: 'They have not activated their agent wallets yet. Offer a button to their profile (destination "profile").' };
        }
        const agentAddress = agent === 'buyer' ? wallets.buyerAddress : wallets.sellerAddress;
        let balanceWei: bigint;
        try {
          balanceWei = await readUsdcBalance(agentAddress);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant propose_withdraw balance read failed');
          return { error: 'Could not read the agent wallet balance right now. Try again shortly.' };
        }
        let amountWei: bigint;
        try {
          amountWei = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
        } catch {
          return { error: 'That amount is not a valid USDC value.' };
        }
        if (amountWei <= 0n) return { error: 'The amount must be greater than 0.' };
        if (amountWei > balanceWei) {
          return {
            error: `Their ${agent} agent wallet holds only ${formatUnits(balanceWei, USDC_DECIMALS)} USDC, less than ${amountUsdc}. Tell them the available balance and suggest a smaller amount.`,
          };
        }
        const built = buildWithdrawConfirm({
          caller: address,
          agent,
          toAddress: to,
          amountUsdc,
          balanceAfterUsdc: formatUnits(balanceWei - amountWei, USDC_DECIMALS),
        });
        if ('error' in built) return built;
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_cash_out: tool({
      description:
        "Prepare a confirm card to CASH OUT USDC from the user's Arc wallet to another blockchain (bridge out via CCTP): move USDC off Arc to Base, Arbitrum, Optimism, Ethereum, or Polygon. Use when they want to cash out / bridge out / send USDC to another chain and have given an amount, a chain, and a 0x destination address. This moves real USDC across chains and cannot be undone.",
      inputSchema: z.object({
        destChain: z
          .enum(['base', 'arbitrum', 'optimism', 'ethereum', 'polygon'])
          .describe('Destination chain to bridge the USDC to.'),
        toAddress: z.string().min(1).max(60).describe('Destination address on that chain, a full 0x address.'),
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to cash out.'),
      }),
      execute: async ({ destChain, toAddress, amountUsdc }) => {
        // Backend-signed cash-out burns from the user's Arc identity DCW, which
        // only exists for Circle (email/passkey) accounts. Web3 users hold their
        // Arc USDC on their own EOA and must sign the burn themselves, so route
        // them to the bridge screen instead of showing an in-chat card.
        if (method !== 'circle') {
          return { error: 'Cashing out from chat is available for email/passkey accounts. This user signed in with a web3 wallet, so they sign the bridge themselves. Send them to the bridge screen with propose_navigation (destination "cash_out").' };
        }
        const to = toAddress.trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
          return { error: 'That destination is not a valid 0x address. Ask them to paste the full address.' };
        }
        const chain = CASH_OUT_CHAINS[destChain];
        if (!chain) return { error: 'That chain is not supported for cash-out.' };
        let balanceWei: bigint;
        try {
          balanceWei = await readUsdcBalance(address);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant propose_cash_out balance read failed');
          return { error: 'Could not read your Arc balance right now. Try again shortly.' };
        }
        let amountWei: bigint;
        try {
          amountWei = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
        } catch {
          return { error: 'That amount is not a valid USDC value.' };
        }
        if (amountWei <= 0n) return { error: 'The amount must be greater than 0.' };
        if (amountWei > balanceWei) {
          return {
            error: `Your Arc wallet holds only ${formatUnits(balanceWei, USDC_DECIMALS)} USDC, less than ${amountUsdc}. Tell them the available balance and suggest a smaller amount.`,
          };
        }
        const built = buildCashOutConfirm({
          caller: address,
          destChainKey: chain.key,
          destChainLabel: chain.label,
          recipient: to,
          amountUsdc,
          balanceAfterUsdc: formatUnits(balanceWei - amountWei, USDC_DECIMALS),
        });
        if ('error' in built) return built;
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),
  };
}

/// The authenticated-assistant preamble, appended to the shared knowledge base.
/// It grants the read tools and draws the hard read-only line.
function authenticatedPreamble(address: string, method: string): string {
  return [
    '',
    '# You are talking to a SIGNED-IN user',
    `They are signed in as ${address} (via ${method}). You can look up THIS user's own`,
    'data with tools: their wallet balance, their deals, one deal\'s status, and a plain',
    'explanation of an error they hit.',
    '',
    'Rules for the signed-in session:',
    '- When they ask about their balance, their deals, or a specific deal, CALL A TOOL and',
    '  answer from what it returns. Never invent a balance, an amount, a status, or a deal id.',
    '- If a tool returns an error or nothing, say so plainly. Do not paper over it with a guess.',
    '- You can READ, and you can PREPARE two things for them to approve, each as a confirm card that',
    '  does nothing until they tap Confirm:',
    '    1. Post a standing OFFER to supply work or goods: call propose_post_offer once they have given',
    '       a title, a short description, and an asking price. It moves no money and is cancelable.',
    '    2. RELEASE a milestone payment on a deal they are the BUYER on: call propose_release with the',
    '       jobId when they clearly want to pay out, release, or approve a delivery. This pays the',
    '       seller real USDC and is FINAL. Only the buyer can release, and only after delivery.',
    '    3. WITHDRAW USDC from one of their own agent wallets to an external Arc address: call',
    '       propose_withdraw when they want to withdraw on Arc and have given an amount and a',
    '       destination 0x address. Sale proceeds are in the seller agent, refunds in the buyer agent.',
    '       This moves real USDC and is FINAL. Always confirm the destination address is theirs.',
    '    4. CASH OUT USDC from Arc to ANOTHER chain (Base, Arbitrum, Optimism, Ethereum, Polygon):',
    '       call propose_cash_out when they want to bridge out / cash out to another chain and have',
    '       given an amount, a chain, and a 0x address. This bridges real USDC off Arc and is FINAL.',
    '- You cannot yet EXECUTE anything else: no cancelling, topping up (adding money onto Arc), or',
    '  posting a REQUEST for work they need (that funds an auction). For those, call propose_navigation',
    '  to show a button to the right screen, where they finish it themselves. Do not just describe the',
    '  page. Add one short line of context with the button.',
    '- Amounts are USDC on Arc testnet. Keep replies plain and short.',
  ].join('\n');
}

/// Run the authenticated tool-calling loop and return the assistant's reply plus
/// any navigate actions it surfaced (rendered as buttons in the chat). Throws on
/// model failure/timeout so the route can fall back to the anonymous knowledge-
/// only path. Bounded to a few tool steps so one turn is cheap.
export async function runAssistantAgent(input: {
  address: string;
  method: string;
  messages: AssistantChatMessage[];
}): Promise<{ text: string; actions: AssistantAction[] }> {
  const model = assistantAgentModel;
  if (!model) throw new Error('assistant agent model unavailable');

  const system = KARWAN_ASSISTANT_SYSTEM + '\n' + authenticatedPreamble(input.address, input.method);
  const actions: AssistantAction[] = [];

  const { text } = await withLlmTimeout(
    'assistant.agent',
    generateText({
      model,
      system,
      messages: input.messages,
      tools: buildTools(input.address, input.method, actions),
      // Allow a few reasoning+tool rounds (e.g. list deals, then read one, then
      // propose a button), then force a final text answer. A handful of calls max.
      stopWhen: stepCountIs(5),
      maxOutputTokens: 700,
    }),
    30_000,
  );

  return { text: text.trim(), actions };
}
