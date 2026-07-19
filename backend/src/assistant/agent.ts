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

/// Build the read tool set bound to one caller. Every tool reads only `address`'s
/// own data. Tools return plain objects (including `{ error }`) rather than
/// throwing, so the model can explain a failure to the user instead of the loop
/// aborting.
function buildTools(address: string) {
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
    '- You can READ but you cannot yet ACT. You cannot move money, fund, release, cancel, top up,',
    '  bridge, or change anything on their account. If they ask you to DO one of those, say that',
    '  acting from chat is coming soon and point them to the page that does it today (e.g. the',
    '  deal page for release, the Profile for withdraw and top up).',
    '- Amounts are USDC on Arc testnet. Keep replies plain and short, with in-app links where useful.',
  ].join('\n');
}

/// Run the authenticated tool-calling loop and return the assistant's reply text.
/// Throws on model failure/timeout so the route can fall back to the anonymous
/// knowledge-only path. Bounded to a few tool steps so one turn is cheap.
export async function runAssistantAgent(input: {
  address: string;
  method: string;
  messages: AssistantChatMessage[];
}): Promise<string> {
  const model = assistantAgentModel;
  if (!model) throw new Error('assistant agent model unavailable');

  const system = KARWAN_ASSISTANT_SYSTEM + '\n' + authenticatedPreamble(input.address, input.method);

  const { text } = await withLlmTimeout(
    'assistant.agent',
    generateText({
      model,
      system,
      messages: input.messages,
      tools: buildTools(input.address),
      // Allow a few reasoning+tool rounds (e.g. list deals, then read one), then
      // force a final text answer. Keeps a single turn to a handful of calls.
      stopWhen: stepCountIs(5),
      maxOutputTokens: 700,
    }),
    30_000,
  );

  return text.trim();
}
