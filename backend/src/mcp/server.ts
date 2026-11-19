import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isRefusal, type AgentIdentity, type AgentJobs } from '../agentJobs/agentJobs.js';
import type { FoundSeller } from './match.js';
import { CHECK_PRICE_USDC, FIND_PRICE_USDC, type PaidTools } from './payments.js';

/// The Karwan MCP server for agents outside Karwan (view 15). One server per
/// request, already bound to the agent AgentKit verified, so every tool acts
/// for that agent and the one person behind it. Tools translate only; the
/// outside-agent jobs core decides.

export const MCP_TOOLS = ['find_counterparty', 'check_person', 'open_protected_deal', 'fund_deal', 'deal_status', 'request_release', 'open_dispute', 'get_rating'] as const;

export interface McpDeps {
  core: AgentJobs;
  paid: PaidTools | null;
  find(input: { need: string; budgetUsdc: number; deadlineDays: number; agentAddress: string }): Promise<FoundSeller[]>;
  check(handle: string): Promise<Record<string, unknown>>;
  /// The free rating read (view 93), and whether this caller is still under its limit.
  rating(handle: string, forWork?: string): Promise<Record<string, unknown>>;
  ratingAllowed(agentAddress: string): boolean;
}

type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> };

const answer = (body: Record<string, unknown>): Result => {
  // A refusal is an error result, so a paid tool is never charged for it.
  if (isRefusal(body)) return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true, structuredContent: body };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], structuredContent: body };
};
const unpaid = (): Result => answer({ ok: false, code: 'PAYMENTS_OFF', message: 'Paid tools are not available right now. Try again later.' });

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const ref = z.string().regex(/^aj_[0-9a-f]{16}$/);

export function buildMcpServer(identity: AgentIdentity, deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'karwan', version: '1.0.0' });
  const { core } = deps;

  const findArgs = {
    need: z.string().min(3).max(500).describe('What the person needs done, in plain words'),
    budgetUsdc: z.number().positive().max(1_000).describe('The most they will pay, in USDC'),
    deadlineDays: z.number().int().min(1).max(60).describe('Days until it must be delivered'),
  };
  const find = async (a: { need: string; budgetUsdc: number; deadlineDays: number }) => {
    const sellers = await deps.find({ ...a, agentAddress: identity.agentAddress });
    return answer(sellers.length
      ? { ok: true, sellers }
      : { ok: true, sellers: [], next: 'No Karwan seller fits yet. Try other words, a larger budget or more days.' });
  };
  server.registerTool('find_counterparty', {
    description: `Find Karwan sellers who fit a need. Karwan matches inside on their full records and answers with up to 5 people: tag, tier, reasons, rating, price and days. The payment is for the match; a rating alone is free with get_rating. Costs ${FIND_PRICE_USDC} USDC with x402 on Arc Testnet.`,
    inputSchema: findArgs,
  }, deps.paid ? deps.paid.find(find as never) as never : (async () => unpaid()) as never);

  const checkArgs = { handle: z.string().min(2).max(64).describe('A Karwan tag, with or without @') };
  const check = async (a: { handle: string }) => answer(await deps.check(a.handle));
  server.registerTool('check_person', {
    description: `A Karwan member's public record: name, tag, tier, fixed reasons and rating, never a score or counts. For the rating alone use get_rating, which is free. Costs ${CHECK_PRICE_USDC} USDC with x402 on Arc Testnet.`,
    inputSchema: checkArgs,
  }, deps.paid ? deps.paid.check(check as never) as never : (async () => unpaid()) as never);

  const ratingArgs = {
    handle: z.string().min(2).max(64).describe('A Karwan tag, with or without @'),
    forWork: z.string().max(200).optional().describe('The work you are judging them for, in plain words, to get their rating on deals like it'),
  };
  server.registerTool('get_rating', {
    description: "A Karwan member's rating: stars, how many deals it is from, how many of those were disputed, and with forWork their rating on deals like that work. Free, no payment. Never the record (no score or counts).",
    inputSchema: ratingArgs,
  }, (async (a: { handle: string; forWork?: string }) =>
    deps.ratingAllowed(identity.agentAddress)
      ? answer(await deps.rating(a.handle, a.forWork))
      : answer({ ok: false, code: 'RATE_LIMITED', message: 'Too many rating reads this minute. Try again in a minute.' })) as never);

  server.registerTool('open_protected_deal', {
    description: 'Open a protected deal with a Karwan seller, funded later from your wallet on the job escrow. The first time, the person you act for must verify once with World ID: you get a link for them and nothing is opened. Returns the quote (work plus half the 1% fee) and the exact call to send.',
    inputSchema: {
      seller: z.string().min(2).max(64).describe('The seller\'s Karwan tag'),
      work: z.string().min(3).max(500).describe('What will be delivered'),
      amountUsdc: z.number().positive().describe('The price of the work, in USDC'),
      deadlineDays: z.number().int().min(1).max(60),
    },
  }, async (a) => answer(await core.open(identity, a)));

  server.registerTool('fund_deal', {
    description: 'After you sent the create call: give its transaction hash. Karwan checks it on Arc and returns the budget, approve and fund calls with exact amounts, or how much more USDC your wallet needs.',
    inputSchema: { ref, createTxHash: hash },
  }, async (a) => answer(await core.fund(identity, a.ref, a.createTxHash as `0x${string}`)));

  server.registerTool('deal_status', {
    description: 'Where a deal stands, read from Arc, and what to do next. Past the deadline with nothing delivered, it returns the refund call. When it says remindYourPerson, the review ends within a day and silence pays the seller.',
    inputSchema: { ref },
  }, async (a) => answer(await core.status(identity, a.ref)));

  server.registerTool('request_release', {
    description: 'Once the work is delivered: a one-time link for the person you act for to say whether they are happy. Only they can answer it, with the World ID they paired with. You cannot release the money.',
    inputSchema: { ref },
  }, async (a) => answer(await core.requestRelease(identity, a.ref)));

  server.registerTool('open_dispute', {
    description: 'When the person you act for is not happy with the delivered work: the same one-time link, where they say what is wrong. Karwan then rejects the work and the seller has 3 days to dispute; otherwise the money comes back to your wallet.',
    inputSchema: { ref },
  }, async (a) => answer(await core.requestRelease(identity, a.ref)));

  return server;
}
