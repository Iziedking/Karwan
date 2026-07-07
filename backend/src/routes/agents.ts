import { Hono } from 'hono';
import { z } from 'zod';
import { generateObject } from 'ai';
import { config } from '../config.js';
import { getBuyerSnapshot } from '../agents/buyer.js';
import { getSellerSnapshot, abandonBid } from '../agents/seller.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { sessionAddress } from '../auth/session.js';
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

/// Manually abandon one of the caller's own in-flight seller bids. Identity is
/// the signed session (never a query param), and the bid is keyed by the
/// caller's own seller agent address, so a caller can only ever drop their own
/// bid. Idempotent: abandoning an unknown/already-cleared bid returns ok with
/// abandoned:false.
const abandonSchema = z.object({ jobId: z.string().min(1) });

agentsRoutes.post('/seller/bids/abandon', async (c) => {
  const caller = sessionAddress(c);
  if (!caller) return c.json({ error: 'not authenticated' }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }
  const parsed = abandonSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid body' }, 400);
  const agents = await getAgentWallets(caller);
  if (!agents) return c.json({ error: 'no agents for this account' }, 404);
  const abandoned = abandonBid(parsed.data.jobId, agents.sellerAddress);
  return c.json({ ok: true, abandoned });
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
      'DIRECT OR BRIEF. If the user mentioned a milestone split (e.g. "50/50", "30 upfront 70 on delivery", "I pay 30% then 70%"), return the FIRST milestone percentage. Null otherwise.',
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
  acceptanceWindowHours: z
    .number()
    .int()
    .min(1)
    .max(720)
    .nullable()
    .describe(
      'DIRECT ONLY. How long the SELLER has to accept the deal after the buyer creates it. Examples: "accept within 1 hour" → 1, "they have a day to accept" → 24, "respond by tomorrow" → 24, "must accept in 2 days" → 48. NOT the delivery deadline (that is deadlineDays). Convert minutes to integer hours (round up to 1). Null if not mentioned.',
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
      ? 'SURFACE: direct deal. The user is a BUYER posting a deal with a specific counterparty they already have in mind. Focus on: amountUsdc, deadlineDays, terms, suggestedFirstMilestonePct, suggestedTrustedMatch, counterpartyHint, acceptanceWindowHours. Leave title, tolerancePct null. Distinguish "deadline / deliver by" (deadlineDays) from "accept by / respond by" (acceptanceWindowHours) — these are two DIFFERENT clocks. The user often gives both ("1 hour to accept, 7 days to deliver"); extract each into its own field.'
      : surface === 'brief'
        ? 'SURFACE: brief. The user is a BUYER posting an open request that other sellers will bid on. Focus on: amountUsdc (budget cap), deadlineDays, terms, tolerancePct (negotiation room), suggestedFirstMilestonePct (if they state a payment split like "30% then 70%"), suggestedTrustedMatch. Leave title, counterpartyHint null.'
        : 'SURFACE: listing. The user is a SELLER posting an offer for buyers to find. Focus on: title (headline), amountUsdc (ask price), deadlineDays (TTL of the listing), terms (description), tolerancePct. Leave counterpartyHint, suggestedFirstMilestonePct, suggestedTrustedMatch null.';

  return [
    'You extract a structured Karwan deal from a free-text description.',
    'Karwan is an on-chain milestone escrow product settled in USDC on Arc Testnet.',
    surfaceHint,
    '',
    'Real users type messily. Handle all of these:',
    '- Typos and slang ("budjet", "deadlin", "asap", "by EOD friday", "tmrw").',
    '- Mixed currency ("$120", "120 usdc", "120 bucks", "120k naira", "0.04 ETH"). Convert ALL to USDC at 1:1 (this is testnet — do not apply real FX).',
    '- Mixed time units ("2 days", "48 hrs", "by next monday", "this weekend", "EOW", "in a week", "two weeks", "a month"). Convert ALL to DAYS. "Next monday" is 7 days. "EOW" is 5 days. "Tomorrow" is 1. "ASAP" with no number is null + add a note asking for a deadline.',
    '- Tolerance phrased loosely ("flexible", "give or take 15%", "+/- 20", "20% wiggle", "fixed price"). "Fixed" or "no wiggle" → 0. Loose phrases without a number → null. A clear number → that number (0-100).',
    '- Milestone splits phrased as "50/50", "half up front", "30 then 70", "all on delivery" (= 100 first, but Karwan minimum first release is 10).',
    '- Trusted/stake phrased as "trusted", "vetted", "with stake", "insured seller", "I want this backed", or the opposite "casual", "no stake", "fine without". Map to true/false/null.',
    '- Run-on sentences and missing punctuation. Be charitable.',
    '- Don\'t-care or empty fields ("idk for the deadline", "whatever the price"): return null and add a clear note saying you need that value.',
    '',
    'Hard rules:',
    '- Currency: ALWAYS USDC, ALWAYS 1:1 testnet conversion. Never apply real exchange rates.',
    '- Deadline: ALWAYS in days. Negative or zero days → null + a note. Beyond 365 days → cap at 365 and note.',
    '- Be conservative. If a value is not clearly stated, return null and add a note. NEVER invent prices, deadlines, or counterparties.',
    '- Confidence is 0-1: 1 = explicit, 0.5 = reasonable inference, below 0.3 = guess. If you returned null, the confidence for that field is 0.',
    '- Notes: short, plain English, one sentence each. Lead with what the user needs to confirm or fix. Maximum 6.',
    '- The `terms` field is the WORK summary only. Strip prices, dates, counterparty names, tolerance phrases. Max 280 chars.',
    '- Counterparty hint: only return if the user pasted an Ethereum address (exactly 0x + 40 hex chars) or a plausible email. Do not include their name as a counterparty.',
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
    /// Belt-and-braces counterparty extraction. The LLM often misses the
    /// wallet/email even when it's literally in the prompt, especially on
    /// short descriptions or when the address is sandwiched between words
    /// without obvious context. Regex over the raw text catches both shapes
    /// (0x + 40 hex chars; standard email). LLM value wins when present
    /// because the LLM has context about which mention belongs to the
    /// counterparty vs e.g. the user's own contact info; regex only fills
    /// in when LLM gave up.
    if (surface === 'direct' && !object.counterpartyHint) {
      const hint = scanCounterpartyHint(text);
      if (hint) {
        object.counterpartyHint = hint;
        logger.info(
          { hint, surface },
          'extract-deal: filled counterpartyHint via regex fallback',
        );
      }
    }
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

/// Scan free-text for the first plausible counterparty hint, either an
/// Ethereum address (0x + 40 hex chars) or an email. Wallet match is
/// preferred when both are present because a deal address is the more
/// specific signal (you can email anyone; a wallet implies they're already
/// on chain). Returns null when neither pattern hits.
function scanCounterpartyHint(text: string): string | null {
  const ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/;
  const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const addrMatch = text.match(ADDRESS_RE);
  if (addrMatch) return addrMatch[0];
  const emailMatch = text.match(EMAIL_RE);
  if (emailMatch) return emailMatch[0].toLowerCase();
  return null;
}
