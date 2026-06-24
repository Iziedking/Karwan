import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { generateObject } from 'ai';
import { z } from 'zod';
import { researchModel } from '../llm/client.js';
import { withLlmRetry } from '../agents/llm-utils.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Off-platform x402: the agent pays EXTERNAL services on Base mainnet for
/// data the platform doesn't have. These sellers use the standard x402
/// exact-EVM scheme (EIP-3009 signed against Base USDC's own domain,
/// "USD Coin"/"2"), NOT Gateway batching. So the payer is a plain EOA whose
/// key lives in env: it only ever signs; the seller's facilitator submits on
/// chain and pays gas. Funding is just USDC sitting in the payer's wallet.
///
/// The single off-platform use is MARKET RESEARCH: given a deal's keywords,
/// the agent pays a web-search service (Exa, via Circle's x402 marketplace)
/// for live results and synthesises a "market read" with the platform LLM.
/// This replaced the earlier sanctions-screen wiring, which paid for a verdict
/// that never changed and answered the wrong question.

let httpClient: x402HTTPClient | null = null;
let payerAddress = '';

function ensureClient(): x402HTTPClient {
  if (httpClient) return httpClient;
  const pk = config.X402_BASE_PRIVATE_KEY;
  if (!pk) throw new Error('X402_BASE_PRIVATE_KEY is not configured');
  const account = privateKeyToAccount(pk as `0x${string}`);
  payerAddress = account.address.toLowerCase();
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  httpClient = new x402HTTPClient(client);
  logger.info({ payer: payerAddress }, 'x402: external payer initialised');
  return httpClient;
}

/// The payer address (for funding + audit). Empty string until the first
/// paid call initialises the client.
export function externalPayerAddress(): string {
  if (!payerAddress && config.X402_BASE_PRIVATE_KEY) ensureClient();
  return payerAddress;
}

export interface ExternalPayResult<T> {
  data: T;
  paidUsd: number;
  payer: string;
  /// The on-chain settlement tx hash, decoded from the x402 `X-PAYMENT-RESPONSE`
  /// header the resource server returns after its facilitator submits. Absent
  /// when the server doesn't echo it; callers fall back to the payer address.
  txHash?: string;
}

interface PayOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

function requestInit(opts: PayOptions, extraHeaders?: Record<string, string>): RequestInit {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (extraHeaders) Object.assign(headers, extraHeaders);
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };
}

/// Full x402 round-trip against an external endpoint: initial request, 402
/// negotiation via the standard @x402/core client, signed retry. Supports GET
/// and POST (POST endpoints take the same body on the unpaid probe and the
/// paid retry so the server can price and serve the same request).
export async function payExternal<T = unknown>(
  url: string,
  opts: PayOptions = {},
): Promise<ExternalPayResult<T>> {
  const first = await fetch(url, requestInit(opts));
  if (first.ok) {
    return { data: (await first.json()) as T, paidUsd: 0, payer: '' };
  }
  if (first.status !== 402) {
    throw new Error(`external x402 request failed (${first.status})`);
  }

  const http = ensureClient();
  const body = await first.json().catch(() => undefined);
  const paymentRequired = http.getPaymentRequiredResponse(
    (name) => first.headers.get(name),
    body,
  );
  const payload = await http.createPaymentPayload(paymentRequired);
  const signatureHeader = http.encodePaymentSignatureHeader(payload);

  const paid = await fetch(url, requestInit(opts, signatureHeader));
  if (!paid.ok) {
    const detail = await paid.text().catch(() => paid.statusText);
    throw new Error(`external x402 payment failed (${paid.status}): ${detail.slice(0, 300)}`);
  }

  // Price comes from the server's offer, atomic USDC at 6 decimals.
  const accepts = (paymentRequired as { accepts?: Array<{ amount?: string }> }).accepts;
  const paidUsd = Number(accepts?.[0]?.amount ?? 0) / 1e6;

  // Settlement evidence: the server echoes the on-chain tx in the standard
  // x402 X-PAYMENT-RESPONSE header (base64 JSON). Best-effort; callers fall
  // back to the payer address as evidence of the spend.
  let txHash: string | undefined;
  try {
    const settle = paid.headers.get('x-payment-response');
    if (settle) {
      const decoded = JSON.parse(Buffer.from(settle, 'base64').toString('utf8')) as {
        transaction?: string;
        txHash?: string;
      };
      const tx = decoded.transaction ?? decoded.txHash;
      if (tx && /^0x[a-fA-F0-9]{64}$/.test(tx)) txHash = tx;
    }
  } catch {
    /* no settlement header; evidence falls back to the payer address */
  }

  return { data: (await paid.json()) as T, paidUsd, payer: payerAddress, txHash };
}

// Market research (Exa web search over x402 + LLM synthesis)

/// Exa search on Circle's x402 marketplace. Payment authorises the call, so no
/// Exa API key is needed; the 402 round-trip signs an EIP-3009 USDC transfer
/// on Base (~$0.007/call). Returns AI-optimised ranked results with excerpts.
const EXA_SEARCH_URL = 'https://api.exa.ai/search';

interface ExaResult {
  title?: string;
  url?: string;
  publishedDate?: string;
  text?: string;
}

interface ExaResponse {
  results?: ExaResult[];
}

export interface MarketRead {
  keywords: string[];
  /// One-paragraph market read synthesised from the live web results.
  summary: string;
  /// Demand signal for the deal's keywords right now.
  demand: 'hot' | 'steady' | 'soft';
  /// Short pricing/leverage note for the negotiating side.
  priceNote: string;
  /// Best-effort fair market price for a typical deal of this type, in USDC, or
  /// undefined when the evidence gives no basis. The number both agents compare
  /// the buyer's budget against: too far above it = overpriced, below it =
  /// underpriced. Estimated from market evidence only, never from the budget.
  fairPriceUsdc?: number;
  /// How much to trust fairPriceUsdc. The agents only act on the price (overpay
  /// advisory, near-miss justification) when it is 'grounded' — backed by the
  /// web evidence. 'rough' and 'none' are treated as no-price: behave as if
  /// there were no market reference. This is the guard against acting on a
  /// hallucinated number.
  priceConfidence?: 'grounded' | 'rough' | 'none';
  /// A few concrete bullets pulled from the sources.
  highlights: string[];
  /// The sources the read was built from (title + url).
  sources: { title: string; url: string }[];
  paidUsd: number;
  payer: string;
  txHash?: string;
  researchedAt: number;
  /// True when served from the keyword cache (no fresh payment this call). The
  /// caller only meters the account's credit on a fresh (uncached) call.
  cached: boolean;
}

/// A keyword set's market read doesn't move minute to minute; cache per
/// normalised keyword key so multiple bids/matches on the same brief reuse one
/// paid call instead of re-spending.
const researchCache = new Map<string, MarketRead>();
const RESEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/// In-flight paid calls, keyed by keyword set. Without this, several agents
/// evaluating the same brief at once all miss the empty cache and each makes a
/// paid Exa call before the first finishes writing — so one deal pays for the
/// same intel 3+ times. Single-flight: concurrent callers await the running
/// call and are served cached (they don't pay). Exactly one inference payment
/// per keyword set per window, no matter how many agents ask.
const researchInFlight = new Map<string, Promise<MarketRead>>();

/// The grounded market price for a keyword set if it's in the research cache,
/// else undefined. Lets the seller anchor to market without paying again (the
/// research already ran for the deal). Only returns a number when the research
/// was confident — fairPriceUsdc is unset otherwise.
export function getCachedMarketPrice(keywords: string[]): number | undefined {
  const hit = researchCache.get(keywordKey(keywords));
  if (hit && Date.now() - hit.researchedAt < RESEARCH_CACHE_TTL_MS) return hit.fairPriceUsdc;
  return undefined;
}

function keywordKey(keywords: string[]): string {
  return [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join('|');
}

const readSchema = z.object({
  summary: z.string(),
  demand: z.enum(['hot', 'steady', 'soft']),
  priceNote: z.string(),
  fairPriceUsdc: z
    .number()
    .nonnegative()
    .nullable()
    .describe('Fair market price in USDC for a typical deal of this type, or null if no basis'),
  priceConfidence: z
    .enum(['grounded', 'rough', 'none'])
    .describe('grounded = price backed by the evidence; rough = weak guess; none = no basis'),
  highlights: z.array(z.string()).max(5),
});

/// Pay Exa for live web results on the deal's keywords, then synthesise a
/// market read with the platform LLM. Throws on any failure; callers treat the
/// read as best-effort (the deal proceeds without it). Cached per keyword set.
export async function researchMarket(
  keywords: string[],
  context?: string,
): Promise<MarketRead> {
  const cleaned = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 8);
  if (cleaned.length === 0) throw new Error('no keywords to research');
  const key = keywordKey(cleaned);

  const hit = researchCache.get(key);
  if (hit && Date.now() - hit.researchedAt < RESEARCH_CACHE_TTL_MS) {
    return { ...hit, cached: true };
  }

  // Single-flight: if a paid call for this keyword set is already running, wait
  // for it and serve the result as cached so this agent does NOT pay again.
  const running = researchInFlight.get(key);
  if (running) {
    const shared = await running;
    return { ...shared, cached: true };
  }

  const work = doResearchMarket(cleaned, key, context);
  researchInFlight.set(key, work);
  try {
    return await work;
  } finally {
    researchInFlight.delete(key);
  }
}

/// The actual paid call + synthesis. Only ever runs once per keyword set at a
/// time (guarded by researchInFlight); the caller that triggers it is the one
/// charged (cached:false), everyone else awaiting it is served cached:true.
async function doResearchMarket(
  cleaned: string[],
  key: string,
  context?: string,
): Promise<MarketRead> {
  const query =
    `Current market demand, pricing and notable suppliers or buyers for: ${cleaned.join(', ')}.` +
    (context ? ` Context: ${context}.` : '');

  const { data, paidUsd, payer, txHash } = await payExternal<ExaResponse>(EXA_SEARCH_URL, {
    method: 'POST',
    body: {
      query,
      numResults: 5,
      type: 'auto',
      contents: { text: { maxCharacters: 600 } },
    },
  });

  const results = (data.results ?? []).filter((r) => r.url);
  const sources = results
    .map((r) => ({ title: (r.title ?? r.url ?? '').slice(0, 140), url: r.url! }))
    .slice(0, 5);
  const evidence = results
    .map((r, i) => `[${i + 1}] ${r.title ?? ''}\n${(r.text ?? '').replace(/\s+/g, ' ').trim()}`)
    .join('\n\n')
    .slice(0, 4000);

  const synth = await withLlmRetry(`marketRead(${key})`, () =>
    generateObject({
      model: researchModel,
      schema: readSchema,
      prompt: [
        'You are a trade-desk analyst. Using only the web excerpts below, write a',
        'concise market read for a B2B trade deal on these keywords:',
        cleaned.join(', '),
        context ? `Deal context: ${context}` : '',
        '',
        'Web results:',
        evidence || '(no usable excerpts returned)',
        '',
        'Return: a one-paragraph summary (<=60 words); demand as hot/steady/soft;',
        'a one-line price/leverage note for the side negotiating this deal;',
        'fairPriceUsdc as a realistic market price in USDC for a typical deal of',
        'this type drawn ONLY from the evidence (null if the excerpts give no real',
        'basis for a price — do not invent one); priceConfidence as grounded only',
        'when the price is genuinely supported by the results, else rough or none;',
        'and up to 4 short factual highlights drawn from the results. No preamble.',
      ].join('\n'),
    }),
  );

  const read: MarketRead = {
    keywords: cleaned,
    summary: synth.object.summary,
    demand: synth.object.demand,
    priceNote: synth.object.priceNote,
    fairPriceUsdc:
      synth.object.priceConfidence === 'grounded' && synth.object.fairPriceUsdc
        ? synth.object.fairPriceUsdc
        : undefined,
    priceConfidence: synth.object.priceConfidence,
    highlights: synth.object.highlights.slice(0, 4),
    sources,
    paidUsd,
    payer,
    txHash,
    researchedAt: Date.now(),
    cached: false,
  };
  researchCache.set(key, read);
  logger.info(
    { keywords: cleaned, demand: read.demand, paidUsd, sources: sources.length },
    'x402: market researched via Exa',
  );
  return read;
}
