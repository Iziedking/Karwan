import { Hono } from 'hono';
import { z } from 'zod';
import { generateObject } from 'ai';
import { config } from '../config.js';
import { getBuyerSnapshot } from '../agents/buyer.js';
import { getSellerSnapshot } from '../agents/seller.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { llmModel } from '../llm/client.js';
import { withLlmRetry } from '../agents/llm-utils.js';
import { logger } from '../logger.js';

export const agentsRoutes = new Hono();

// Managed deals run on per-user agents. With ?address= these endpoints scope the
// snapshot to that user's own agent; without it they return the whole network.

agentsRoutes.get('/buyer', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ profile: null, ...getBuyerSnapshot() });
  const agents = await getAgentWallets(address);
  if (!agents) return c.json({ profile: null, jobs: [] });
  return c.json({ profile: null, ...getBuyerSnapshot(agents.buyerAddress) });
});

agentsRoutes.get('/seller', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ profile: null, ...getSellerSnapshot() });
  const agents = await getAgentWallets(address);
  if (!agents) return c.json({ profile: null, activeBids: [] });
  return c.json({ profile: null, ...getSellerSnapshot(agents.sellerAddress) });
});

agentsRoutes.get('/status', (c) =>
  c.json({
    chain: { id: 5042002, rpc: config.ARC_TESTNET_RPC_URL, explorer: config.ARC_TESTNET_EXPLORER_URL },
    contracts: {
      jobBoard: config.KARWAN_JOBBOARD_ADDR,
      escrow: config.KARWAN_ESCROW_ADDR,
      reputation: config.KARWAN_REPUTATION_ADDR,
      usdc: config.USDC_ADDR,
      identityRegistry: config.IDENTITY_REGISTRY_ADDR,
    },
    cctpRelay: {
      configured: !!config.cctpRelayWalletId,
      address: config.cctpRelayAddress,
    },
    /// Deprecated: present for backward-compat with frontends pre-rename.
    /// Reads the same resolved value as cctpRelay above. Drop after the
    /// frontend stops reading this field.
    agents: {
      buyer: {
        configured: !!config.cctpRelayWalletId,
        address: config.cctpRelayAddress,
      },
      seller: {
        configured: !!config.SELLER_AGENT_WALLET_ID,
        address: config.SELLER_AGENT_ADDRESS,
      },
    },
  }),
);

/// Natural-language deal extractor for the hybrid intake across the three
/// create flows: direct deal (counterparty already chosen), brief (buyer
/// agent posts a request, opens an auction), listing (seller agent posts
/// an offer). Free text in, structured fields + per-field confidence out.
/// Every surface returns from the same superset schema; per-surface
/// prompts tell the model which fields to focus on, and the frontend
/// per-surface composer maps the relevant subset into URL params that
/// the existing form picks up on mount.
const extractSchema = z.object({
  text: z.string().min(8).max(4_000),
  surface: z.enum(['direct', 'brief', 'listing']),
});

/// Schema is a superset across all three surfaces. The per-surface prompt
/// tells the model which fields to focus on; irrelevant fields stay null.
/// The frontend composer per surface maps the subset it cares about into
/// URL params that the existing form picks up.
const extractionSchema = z.object({
  amountUsdc: z
    .number()
    .positive()
    .nullable()
    .describe(
      'For direct: total deal value in USDC. For brief: buyer budget cap in USDC. For listing: seller ask price per unit. Convert any currency to USDC at 1:1. Null if not stated.',
    ),
  deadlineDays: z
    .number()
    .positive()
    .nullable()
    .describe(
      'Delivery deadline or listing TTL expressed in DAYS. Convert hours (1h = 0.0417), weeks (1w = 7), months (1m = 30). Null if not stated.',
    ),
  terms: z
    .string()
    .describe(
      'Concise plain-English summary of the work, brief, or service. Max 280 chars. Strip prices, dates, addresses, and titles — those live in their own fields.',
    ),
  title: z
    .string()
    .nullable()
    .describe(
      'LISTING ONLY. The headline name of the offer (e.g. "Solidity audit", "Logo design"). Max 80 chars. Null for direct or brief surfaces, and null if the user did not state a title.',
    ),
  tolerancePct: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .describe(
      'BRIEF OR LISTING. Negotiation tolerance percent (e.g. "+/- 20%" → 20). 0-100. Null for direct surface, and null if the user did not state tolerance.',
    ),
  suggestedFirstMilestonePct: z
    .number()
    .min(10)
    .max(90)
    .nullable()
    .describe(
      'DIRECT ONLY. If the user mentioned a milestone split (e.g. "50/50", "30 upfront 70 on delivery"), return the FIRST milestone percentage. Null otherwise.',
    ),
  suggestedTrustedMatch: z
    .boolean()
    .nullable()
    .describe(
      'DIRECT OR BRIEF. True if user wants trusted/stake-backed/insured. False if explicit "casual" or "no stake". Null if not mentioned. Null for listing.',
    ),
  counterpartyHint: z
    .string()
    .nullable()
    .describe(
      'DIRECT ONLY. If the user mentions a wallet address (0x... 42 chars) or email for the counterparty, return verbatim. Null otherwise.',
    ),
  confidence: z.object({
    amount: z.number().min(0).max(1),
    deadline: z.number().min(0).max(1),
    terms: z.number().min(0).max(1),
  }),
  notes: z
    .array(z.string())
    .max(6)
    .describe('Up to 6 short notes for the user: ambiguities, assumptions you made, things they may want to adjust. One short sentence each.'),
});

function buildExtractPrompt(
  surface: 'direct' | 'brief' | 'listing',
  text: string,
): string {
  const surfaceHint =
    surface === 'direct'
      ? 'SURFACE: direct deal. The user is a BUYER posting a deal with a specific counterparty they already have in mind. Focus on: amountUsdc, deadlineDays, terms, suggestedFirstMilestonePct, suggestedTrustedMatch, counterpartyHint. Leave title, tolerancePct null.'
      : surface === 'brief'
        ? 'SURFACE: brief. The user is a BUYER posting an open request that other sellers will bid on. Focus on: amountUsdc (budget cap), deadlineDays, terms, tolerancePct (negotiation room), suggestedTrustedMatch. Leave title, counterpartyHint, suggestedFirstMilestonePct null.'
        : 'SURFACE: listing. The user is a SELLER posting an offer for buyers to find. Focus on: title (headline), amountUsdc (ask price), deadlineDays (TTL of the listing), terms (description), tolerancePct. Leave counterpartyHint, suggestedFirstMilestonePct, suggestedTrustedMatch null.';

  return [
    'You extract a structured Karwan deal from a free-text description.',
    'Karwan is an on-chain milestone escrow product settled in USDC on Arc Testnet.',
    surfaceHint,
    'Rules:',
    '- Currency is always USDC. Convert any other currency at 1:1 to USDC (this is testnet).',
    '- Deadline is always in DAYS. Convert hours, weeks, and months.',
    '- Be conservative. If a value is not clearly stated, return null and add a note.',
    '- Confidence is 0-1: 1 = the user stated it explicitly, 0.5 = inferred reasonably, below 0.3 = guess.',
    '- Notes should help the user adjust before posting. Maximum 6.',
    '- DO NOT invent prices, deadlines, or counterparties.',
    '',
    'User description:',
    '"""',
    text.trim(),
    '"""',
  ].join('\n');
}

agentsRoutes.post('/extract-deal', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }
  const parsed = extractSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid body', detail: parsed.error.flatten() }, 400);
  }
  const { text, surface } = parsed.data;

  try {
    const { object } = await withLlmRetry(`extract-deal:${surface}`, () =>
      generateObject({
        model: llmModel,
        schema: extractionSchema,
        prompt: buildExtractPrompt(surface, text),
      }),
    );
    return c.json({ ok: true, extracted: object });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'extract-deal LLM call failed');
    return c.json(
      {
        error: 'extraction failed',
        detail: 'The model could not parse this description. Try the structured form instead.',
      },
      502,
    );
  }
});
