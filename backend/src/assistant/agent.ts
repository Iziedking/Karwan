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
import { resolveSellerProfile, resolveBuyerProfileForUser } from '../agents/agent-registry.js';
import { readUserGatewayBalance } from '../gateway/balance.js';
import { diagnoseUserError } from '../llm/supervisor.js';
import {
  buildNavigateAction,
  buildPostOfferConfirm,
  buildPostRequestConfirm,
  buildReleaseConfirm,
  buildWithdrawConfirm,
  buildCashOutConfirm,
  buildGatewayDepositConfirm,
  buildGatewayFundAgentConfirm,
  buildGatewayCashOutConfirm,
  NAVIGATE_DESTINATIONS,
  type AssistantAction,
} from './actions.js';

/// Friendly chain names the model may pick for a cash-out, mapped to the CCTP
/// chain keys the bridge-out route expects. Testnet keys because Karwan is on Arc
/// Testnet. Kept to the well-supported set (mirrors CircleBridgeChainKey).
const CASH_OUT_CHAINS: Record<string, { key: string; label: string; solana?: boolean }> = {
  base: { key: 'baseSepolia', label: 'Base' },
  arbitrum: { key: 'arbitrumSepolia', label: 'Arbitrum' },
  optimism: { key: 'optimismSepolia', label: 'Optimism' },
  ethereum: { key: 'sepolia', label: 'Ethereum' },
  polygon: { key: 'polygonAmoy', label: 'Polygon' },
  // Solana Devnet: verified end-to-end via the bridge-out path (App Kit derives
  // the recipient ATA from the base58 owner). Only on cash_out (bridge-out), NOT
  // gateway_cash_out (Gateway spend to Solana is unproven).
  solana: { key: 'solanaDevnet', label: 'Solana', solana: true },
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
        "Read the signed-in user's full money picture on Arc testnet: their sign-in wallet (USDC + native gas), their buyer and seller agent wallets (USDC + address), and their unified balance if they have one. Use this whenever they ask what their balance is, where their money is, how much USDC they have, what their agent wallet addresses are, or whether they can afford something. Never guess a number.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const [usdc, gas, record, unified] = await Promise.all([
            readUsdcBalance(address),
            publicClient.getBalance({ address: address as Address }),
            getAgentWallets(address).catch(() => null),
            readUserGatewayBalance(address).catch(() => null),
          ]);
          const agentBal = async (addr?: string) =>
            addr ? formatUnits(await readUsdcBalance(addr), USDC_DECIMALS) : null;
          const [buyerUsdc, sellerUsdc] = await Promise.all([
            agentBal(record?.buyerAddress),
            agentBal(record?.sellerAddress),
          ]);
          return {
            wallet: {
              address,
              usdc: formatUnits(usdc, USDC_DECIMALS),
              gas: formatUnits(gas, NATIVE_DECIMALS),
            },
            buyerAgent: record?.buyerAddress
              ? { address: record.buyerAddress, usdc: buyerUsdc }
              : null,
            sellerAgent: record?.sellerAddress
              ? { address: record.sellerAddress, usdc: sellerUsdc }
              : null,
            unifiedBalance: unified ? unified.available.toFixed(2) : null,
            note: 'Agents trade from the agent wallets. Sale proceeds land in the seller agent; refunds in the buyer agent. The unified balance is a pooled USDC balance you can use to fund either agent.',
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

    propose_post_request: tool({
      description:
        "Prepare a confirm card to post the user's REQUEST for work or goods they NEED (the agent-mediated path, aka the buyer desk). Use this when they want the platform to find someone for them — e.g. \"find me a developer\", \"I need X built\", \"let the platform look for one\" — and they have given what they need, a budget in USDC, and a deadline. On confirm it posts as themselves; their buyer agent then runs an auction, matches candidates, scores them on skill + reputation, and brings proposals back for them to approve. Nothing is paid until they approve a match. Do NOT use propose_post_offer for this (that advertises what they SELL); this is for what they want to BUY.",
      inputSchema: z.object({
        brief: z.string().min(5).max(1000).describe('What they need, plainly. e.g. "web3 developer to build a trading bot".'),
        budgetUsdc: z.number().positive().max(5_000_000).describe('Budget in USDC.'),
        deadlineDays: z.number().min(0.0006).max(90).describe('How many days until they need it done.'),
      }),
      execute: async (args) => {
        // Pre-flight the SAME preconditions the jobs route enforces so the card
        // never 409s on submit. Activation + buyer profile are cheap store reads;
        // the buyer-agent balance check stays on the route (its 409 is specific).
        const agents = await getAgentWallets(address).catch(() => null);
        if (!agents) {
          return { error: 'They must activate their agent wallets first. Offer a button to their profile (destination "profile").' };
        }
        const buyerProfile = await resolveBuyerProfileForUser(address).catch(() => null);
        if (!buyerProfile) {
          return { error: 'They need a buyer profile first. Offer a button to the request desk (destination "new_request").' };
        }
        const built = buildPostRequestConfirm({ caller: address, ...args });
        if ('error' in built) return built;
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.title, note: 'Posting requires their buyer agent to hold the budget in USDC. If confirm returns an insufficient-balance error, offer to fund the buyer agent (propose_gateway_fund_agent) or send them to add money.' };
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
        "Prepare a confirm card to CASH OUT USDC from the user's Arc wallet to another blockchain (bridge out): move USDC off Arc to Base, Arbitrum, Optimism, Ethereum, Polygon, or Solana. Use when they want to cash out / bridge out / send USDC to another chain and have given an amount, a chain, and a destination address (0x for EVM chains, a base58 address for Solana). This moves real USDC across chains and cannot be undone.",
      inputSchema: z.object({
        destChain: z
          .enum(['base', 'arbitrum', 'optimism', 'ethereum', 'polygon', 'solana'])
          .describe('Destination chain to bridge the USDC to.'),
        toAddress: z.string().min(1).max(60).describe('Destination address: a 0x address for EVM chains, or a base58 address for Solana.'),
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
        const chain = CASH_OUT_CHAINS[destChain];
        if (!chain) return { error: 'That chain is not supported for cash-out.' };
        const to = toAddress.trim();
        if (chain.solana) {
          if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to)) {
            return { error: 'That is not a valid Solana address. Ask them to paste their base58 Solana address.' };
          }
        } else if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
          return { error: 'That destination is not a valid 0x address. Ask them to paste the full address.' };
        }
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

    propose_gateway_deposit: tool({
      description:
        "Prepare a confirm card to ADD USDC to the user's unified balance (a pooled USDC balance they can use to fund their agent wallets). Use when they want to add money to their balance / top up their unified balance and have given an amount. Available for email/passkey accounts only; the backend moves it from their sign-in wallet.",
      inputSchema: z.object({
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to add to the unified balance.'),
      }),
      execute: async ({ amountUsdc }) => {
        if (method !== 'circle') {
          return { error: 'A unified balance is for email/passkey accounts. This user holds their own wallet, so tell them (warmly) that they are in full control, and to trade hands-free they just fund their buyer and seller agent wallets directly from their wallet. Offer a button to their profile (destination "profile") where the agent addresses and funding live.' };
        }
        let balanceWei: bigint;
        try {
          balanceWei = await readUsdcBalance(address);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant propose_gateway_deposit balance read failed');
          return { error: 'Could not read your wallet balance right now. Try again shortly.' };
        }
        let amountWei: bigint;
        try {
          amountWei = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
        } catch {
          return { error: 'That amount is not a valid USDC value.' };
        }
        if (amountWei > balanceWei) {
          return { error: `Your wallet holds only ${formatUnits(balanceWei, USDC_DECIMALS)} USDC, less than ${amountUsdc}. Suggest a smaller amount or adding money first.` };
        }
        const built = buildGatewayDepositConfirm({
          amountUsdc,
          balanceAfterUsdc: formatUnits(balanceWei - amountWei, USDC_DECIMALS),
        });
        if ('error' in built) return built;
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_gateway_fund_agent: tool({
      description:
        "Prepare a confirm card to FUND one of the user's agent wallets from their unified balance, so the agent can trade. Use when they want to fund / top up their buyer or seller agent from their balance and have given an amount. Requires a funded unified balance.",
      inputSchema: z.object({
        agent: z.enum(['buyer', 'seller']).describe('Which agent wallet to fund.'),
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to move from the unified balance to the agent.'),
      }),
      execute: async ({ agent, amountUsdc }) => {
        const unified = await readUserGatewayBalance(address).catch(() => null);
        if (!unified || unified.available <= 0) {
          return { error: 'They have no unified balance yet. Suggest adding money to their balance first with propose_gateway_deposit (or, for a web3 wallet, funding the agent directly).' };
        }
        if (unified.available < amountUsdc) {
          return { error: `Their unified balance is ${unified.available.toFixed(2)} USDC, less than ${amountUsdc}. Suggest a smaller amount or adding money first.` };
        }
        const built = buildGatewayFundAgentConfirm({
          agent,
          amountUsdc,
          balanceAfterUsdc: (unified.available - amountUsdc).toFixed(2),
        });
        if ('error' in built) return built;
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_gateway_cash_out: tool({
      description:
        "Prepare a confirm card to CASH OUT USDC from the user's UNIFIED BALANCE to another blockchain (Base, Arbitrum, Optimism, Ethereum, Polygon). Use when they want to cash out or send USDC from their unified balance to another chain and have given an amount, a chain, and a 0x address. This is distinct from propose_cash_out (which sends from their Arc wallet); use THIS when the money should come from their unified balance. Works for every account type. Requires a funded unified balance.",
      inputSchema: z.object({
        destChain: z
          .enum(['base', 'arbitrum', 'optimism', 'ethereum', 'polygon'])
          .describe('Destination chain to bridge the USDC to.'),
        toAddress: z.string().min(1).max(60).describe('Destination address on that chain, a full 0x address.'),
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to cash out.'),
      }),
      execute: async ({ destChain, toAddress, amountUsdc }) => {
        const to = toAddress.trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
          return { error: 'That destination is not a valid 0x address. Ask them to paste the full address.' };
        }
        const chain = CASH_OUT_CHAINS[destChain];
        if (!chain) return { error: 'That chain is not supported for cash-out.' };
        const unified = await readUserGatewayBalance(address).catch(() => null);
        if (!unified || unified.available <= 0) {
          return { error: 'They have no unified balance yet. Suggest adding money to it first with propose_gateway_deposit.' };
        }
        if (unified.available < amountUsdc) {
          return { error: `Their unified balance is ${unified.available.toFixed(2)} USDC, less than ${amountUsdc}. Suggest a smaller amount or adding money first.` };
        }
        const built = buildGatewayCashOutConfirm({
          destChainKey: chain.key,
          destChainLabel: chain.label,
          recipient: to,
          amountUsdc,
          balanceAfterUsdc: (unified.available - amountUsdc).toFixed(2),
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
  const circle = method === 'circle';
  return [
    '',
    '# You are an ACTING assistant for a SIGNED-IN user (NOT guidance-only)',
    `Signed in as ${address} via ${method}. IGNORE any earlier line that says you are "guidance only" or`,
    'that you "cannot move funds or act" — for THIS signed-in user you CAN, through the tools below. Every',
    'action still runs through a confirm card the user taps, so you never move money on your own — but you',
    'PREPARE it directly and confidently. Think of yourself as a capable operator who gets things done.',
    '',
    '## Be autonomous. Do NOT interrogate.',
    '- When the user tells you to do something, DO IT: call the right tool immediately and let the confirm',
    '  card carry the details. Do NOT ask which wallet, which source, or to re-confirm what they just said.',
    `- Default the source to their MAIN wallet (their ${circle ? 'sign-in' : 'identity'} wallet) unless they`,
    '  name another. The card shows source + amount + destination, so the user verifies correctness THERE —',
    '  that IS the confirmation. Never ask a question the card already answers.',
    '- Ask ONLY when a REQUIRED value is genuinely missing (no destination address, or no amount). Then ask',
    '  once, in one short line. Never ask twice.',
    '- If they request several things at once, prepare ALL the cards in the same turn.',
    '',
    '## When you show a confirm card, say ONE short line at most.',
    '  The card already shows from / amount / to / balance-after / any warning. Do NOT restate the amount,',
    '  the address, or "this is final" in prose — that is noise the card already covers. Something like',
    '  "Done — confirm below." is enough. Often no words are needed at all.',
    '',
    '## What you can do (each via a confirm card):',
    '- READ (always read before stating a number; never guess): get_my_balance (full money picture — the',
    '  sign-in wallet, both agent wallets, and the unified balance), list_my_deals, get_deal_status, explain_error.',
    '- Post a standing OFFER (what they SELL): propose_post_offer(title, description, price). No money, cancelable.',
    '- Post a REQUEST (what they NEED — the agent-mediated deal): propose_post_request(brief, budget, deadlineDays).',
    '  Use this the moment they say "find me a developer", "let the platform look for one", "I need X built".',
    '  Their buyer agent then runs the auction and brings proposals to approve; nothing is paid until they approve.',
    '- RELEASE a milestone to the seller (buyer only, after delivery): propose_release(jobId). FINAL.',
    '- WITHDRAW from an agent wallet to an Arc 0x address: propose_withdraw(agent, toAddress, amount). FINAL.',
    '- CASH OUT from the Arc wallet to another chain (Base/Arbitrum/Optimism/Ethereum/Polygon/SOLANA):',
    '  propose_cash_out (0x address for EVM, base58 for Solana). FINAL.',
    '- UNIFIED BALANCE (the pooled USDC that funds agents hands-free): add to it (propose_gateway_deposit),',
    '  fund an agent from it (propose_gateway_fund_agent), cash it out to another chain (propose_gateway_cash_out).',
    '  Prefer propose_gateway_cash_out when they already have a unified balance.',
    '- NAVIGATE (propose_navigation) for things chat cannot do yet: top up USDC onto Arc, settings, faucet.',
    '  Show a button; do not just describe the page.',
    '',
    circle
      ? '## This is a Circle (email/passkey) account: the backend signs EVERYTHING. No wallet popup ever. Just prepare the card.'
      : '## This is a web3 wallet. Their AGENT wallets are still backend-signed, so release, withdraw-from-agent, and fund-agent all work from chat. ONLY actions on their own identity EOA (cash out FROM their Arc wallet, or top up) need their own signature, which chat cannot do yet — for those, send them to the bridge screen with propose_navigation and frame it warmly as them keeping custody.',
    '- Amounts are USDC on Arc testnet. Be warm, brief, and just get it done.',
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
