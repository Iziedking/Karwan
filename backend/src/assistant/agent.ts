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
import { formatUnits, type Address } from 'viem';
import { assistantAgentModel } from '../llm/client.js';
import { withLlmTimeout } from '../agents/llm-utils.js';
import { KARWAN_ASSISTANT_SYSTEM } from './knowledge.js';
import { readUsdcBalance } from '../chain/contracts.js';
import { arcTestnet, publicClient } from '../chain/client.js';
import { listDealsForAddress, getDeal, type DirectDeal } from '../db/deals.js';
import { diagnoseUserError } from '../llm/supervisor.js';
import { buildNavigateAction, NAVIGATE_DESTINATIONS, type AssistantAction } from './actions.js';
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
function buildTools(address: string, actions: AssistantAction[]) {
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
    '- You can READ but you cannot yet EXECUTE. You cannot move money, fund, release, cancel, top up,',
    '  bridge, or sign anything from chat. But when they want to DO one of those, do not just describe',
    '  the page: call propose_navigation to show them a button that opens the right screen, where they',
    '  finish it themselves with their own confirmation. Add one short line of context with the button.',
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
      tools: buildTools(input.address, actions),
      // Allow a few reasoning+tool rounds (e.g. list deals, then read one, then
      // propose a button), then force a final text answer. A handful of calls max.
      stopWhen: stepCountIs(5),
      maxOutputTokens: 700,
    }),
    30_000,
  );

  return { text: text.trim(), actions };
}
