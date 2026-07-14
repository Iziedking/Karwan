import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, erc20Abi } from 'viem';
import { base } from 'viem/chains';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { generateObject } from 'ai';
import { z } from 'zod';
import { researchModel } from '../llm/client.js';
import { withLlmRetry } from '../agents/llm-utils.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Base mainnet USDC (Circle, verified: developers.circle.com/stablecoins/
/// usdc-contract-addresses). The external x402 payer holds this and nothing
/// else — it signs EIP-3009 authorizations; the facilitator pays gas.
const BASE_USDC_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
/// Rough cost of one full market read (the three-angle Exa sweep over x402).
/// Used to translate the payer's balance into "how many more reads can it fund"
/// for the admin health probe. Deliberately conservative.
const EXTERNAL_CALL_COST_USD = 0.03;
/// Warn when the payer can fund fewer than this many more reads. Below it, the
/// whole live-market-intelligence layer is about to silently go dark.
const PAYER_MIN_CALLS = 20;

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

export interface X402PayerHealth {
  /// Whether the external x402 rail is configured at all (payer key present).
  configured: boolean;
  payer: string;
  /// Base-mainnet USDC balance of the payer, formatted (undefined if unread).
  balanceUsdc?: string;
  /// How many more paid reads that balance can fund (floored).
  callsRemaining?: number;
  /// ok = configured AND balance covers at least PAYER_MIN_CALLS more reads.
  ok: boolean;
  detail: string;
}

function makeBaseClient() {
  return createPublicClient({ chain: base, transport: http(config.BASE_RPC_URL) });
}
let basePublicClient: ReturnType<typeof makeBaseClient> | null = null;
function ensureBaseClient() {
  if (!basePublicClient) basePublicClient = makeBaseClient();
  return basePublicClient;
}

/// Live health of the external x402 payer. Surfaced on the admin diagnostics
/// dashboard so an operator sees the market-intelligence rail going dark BEFORE
/// the payer runs dry and every market read silently no-ops. Reads Base-mainnet
/// USDC via a public RPC (settlement never touches this client). Best-effort:
/// an RPC hiccup reports unknown balance, never throws.
export async function x402PayerHealth(): Promise<X402PayerHealth> {
  if (!config.X402_BASE_PRIVATE_KEY) {
    return {
      configured: false,
      payer: '',
      ok: false,
      detail: 'X402_BASE_PRIVATE_KEY unset — paid market research disabled',
    };
  }
  const payer = externalPayerAddress();
  try {
    const raw = await ensureBaseClient().readContract({
      address: BASE_USDC_ADDR,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [payer as `0x${string}`],
    });
    const balNum = Number(raw) / 1e6;
    const callsRemaining = Math.floor(balNum / EXTERNAL_CALL_COST_USD);
    const ok = callsRemaining >= PAYER_MIN_CALLS;
    return {
      configured: true,
      payer,
      balanceUsdc: balNum.toFixed(4),
      callsRemaining,
      ok,
      detail: ok
        ? `~${callsRemaining} reads funded`
        : `LOW: ~${callsRemaining} reads left (below ${PAYER_MIN_CALLS}) — top up the Base payer`,
    };
  } catch (err) {
    return {
      configured: true,
      payer,
      ok: false,
      detail: `balance read failed: ${(err as Error).message}`,
    };
  }
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

/// One price point pulled from the evidence and VERIFIED in code: the quote is
/// checked verbatim against the source text before the observation is kept, so
/// a price the model invented never reaches the band or the agents. This is
/// what makes the read auditable — every number points at the sentence it came
/// from.
export interface PriceObservation {
  amountUsdc: number;
  /// What the amount prices: 'project', 'hourly', 'monthly', 'per-unit', ...
  unit: string;
  /// The verbatim sentence fragment the price came from.
  quote: string;
  /// Which source (index into `sources`) carries the quote.
  sourceIndex: number;
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
  /// underpriced. Set to the band's midpoint — computed in code from verified
  /// observations, never taken from the model's gestalt.
  fairPriceUsdc?: number;
  /// How much to trust fairPriceUsdc. MECHANICAL, not self-assessed: 'grounded'
  /// = at least two code-verified price observations from distinct sources;
  /// 'rough' = exactly one; 'none' = zero. The agents only act on the price
  /// when it is 'grounded'.
  priceConfidence?: 'grounded' | 'rough' | 'none';
  /// The market price band computed in code from the verified observations:
  /// low = cheapest observed, high = dearest, mid = median. Present only when
  /// at least one observation survived verification.
  priceBandUsdc?: { low: number; mid: number; high: number };
  /// The verified price points behind the band, each quoting its source.
  priceObservations?: PriceObservation[];
  /// A few concrete bullets pulled from the sources.
  highlights: string[];
  /// The sources the read was built from, merged across the sweep's angles and
  /// deduped by domain so five hits on one site can't fake a consensus.
  sources: { title: string; url: string; publishedDate?: string }[];
  /// Which research angles ran ('pricing' | 'demand' | 'landscape'). Fewer than
  /// three means part of the sweep failed and the read is thinner than usual.
  anglesRun?: string[];
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

/// The full cached market read for a keyword set within the TTL, else undefined.
/// Lets the seller counter surface the read's summary + confidence (the seller
/// keeps no per-job marketRead the way the buyer does), without paying again.
export function getCachedMarketRead(keywords: string[]): MarketRead | undefined {
  const hit = researchCache.get(keywordKey(keywords));
  if (hit && Date.now() - hit.researchedAt < RESEARCH_CACHE_TTL_MS) return hit;
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
  priceObservations: z
    .array(
      z.object({
        amountUsdc: z.number().nonnegative(),
        unit: z
          .string()
          .describe("what the amount prices: 'project', 'hourly', 'monthly', 'per-unit', ..."),
        comparable: z
          .boolean()
          .describe('true only when this price is comparable to a whole deal of this type'),
        quote: z
          .string()
          .max(200)
          .describe('VERBATIM sentence fragment from the evidence that contains this price'),
        sourceIndex: z.number().int().nonnegative().describe('index of the [n] source quoted'),
      }),
    )
    .max(8)
    .describe('every explicit price found in the evidence; empty if none'),
  highlights: z.array(z.string()).max(6),
});

/// The three intents the sweep searches separately. One blended query returns
/// blended mediocrity: a page that quotes rates rarely also carries a demand
/// outlook, and a "who are the players" page rarely carries either. Each angle
/// pays its own Exa call and the results merge below.
const SWEEP_ANGLES: { angle: string; query: (kw: string, context?: string) => string }[] = [
  {
    angle: 'pricing',
    query: (kw, ctx) =>
      `Typical prices, rates and cost figures for ${kw} in 2025-2026. How much does it cost, rate cards, quoted project prices.${ctx ? ` Context: ${ctx}.` : ''}`,
  },
  {
    angle: 'demand',
    query: (kw, ctx) =>
      `Current market demand, growth outlook and buying trends for ${kw}.${ctx ? ` Context: ${ctx}.` : ''}`,
  },
  {
    angle: 'landscape',
    query: (kw, ctx) =>
      `Notable suppliers, providers, buyers and competition for ${kw} right now.${ctx ? ` Context: ${ctx}.` : ''}`,
  },
];

/// Only evidence published inside this window feeds the read. A 2019 rate card
/// is worse than none: it anchors the band with authority it no longer has.
const EVIDENCE_MAX_AGE_MS = 18 * 30 * 24 * 60 * 60 * 1000; // ~18 months

/// A model quote survives only if it actually appears in the source it cites,
/// compared with whitespace and case flattened so line wraps in the excerpt
/// don't fail an honest quote.
function quoteAppearsIn(quote: string, text: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const q = norm(quote);
  return q.length >= 8 && norm(text).includes(q);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/// What the model claims it found, before verification.
export interface RawPriceObservation {
  amountUsdc: number;
  unit: string;
  comparable: boolean;
  quote: string;
  sourceIndex: number;
}

/// The reliability core, pure and separately testable: check every claimed
/// price quote against the source it cites, keep only deal-comparable
/// survivors, then derive the band and the confidence mechanically. The model
/// never grades itself — 'grounded' means two independent sources verifiably
/// carry a price.
export function verifyPriceObservations(
  raw: RawPriceObservation[],
  sourceTexts: string[],
): {
  verified: PriceObservation[];
  priceConfidence: 'grounded' | 'rough' | 'none';
  priceBandUsdc?: { low: number; mid: number; high: number };
} {
  const verified: PriceObservation[] = [];
  for (const o of raw) {
    const text = sourceTexts[o.sourceIndex];
    if (!text || o.amountUsdc <= 0) continue;
    if (!o.comparable) continue;
    if (!quoteAppearsIn(o.quote, text)) continue;
    verified.push({
      amountUsdc: o.amountUsdc,
      unit: o.unit.slice(0, 24),
      quote: o.quote.slice(0, 200),
      sourceIndex: o.sourceIndex,
    });
  }
  const distinctSources = new Set(verified.map((o) => o.sourceIndex)).size;
  const priceConfidence: 'grounded' | 'rough' | 'none' =
    distinctSources >= 2 ? 'grounded' : verified.length >= 1 ? 'rough' : 'none';
  const amounts = verified.map((o) => o.amountUsdc);
  const priceBandUsdc =
    amounts.length > 0
      ? {
          low: Math.min(...amounts),
          mid: Math.round(median(amounts) * 100) / 100,
          high: Math.max(...amounts),
        }
      : undefined;
  return { verified, priceConfidence, ...(priceBandUsdc ? { priceBandUsdc } : {}) };
}

/// Pay Exa for live web results on the deal's keywords, then synthesise a
/// market read with the platform LLM. Throws on any failure; callers treat the
/// read as best-effort (the deal proceeds without it). Cached per keyword set.
export async function researchMarket(
  keywords: string[],
  context?: string,
  opts?: { bypassCache?: boolean },
): Promise<MarketRead> {
  const cleaned = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 8);
  if (cleaned.length === 0) throw new Error('no keywords to research');
  const key = keywordKey(cleaned);

  // The user-triggered scout wants a fresh read, so it skips the 6h cache. It
  // still shares an in-flight paid call for the same keywords (below) so two
  // concurrent scouts can't double-pay, and it refreshes the cache the agents
  // read from — a scout warms the negotiation layer for free.
  const hit = researchCache.get(key);
  if (!opts?.bypassCache && hit && Date.now() - hit.researchedAt < RESEARCH_CACHE_TTL_MS) {
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

/// The actual paid sweep + verified synthesis. Only ever runs once per keyword
/// set at a time (guarded by researchInFlight); the caller that triggers it is
/// the one charged (cached:false), everyone else awaiting it is served
/// cached:true.
///
/// Three paid Exa calls run in parallel, one per intent (pricing, demand,
/// landscape). A failed angle just thins the read; only a fully-failed sweep
/// throws. Results merge deduped by URL and capped at two per domain. The LLM
/// then extracts explicit price observations with verbatim quotes, each quote
/// is re-checked against its source IN CODE, and the price band is computed
/// from the survivors — so the number the agents anchor to traces to sentences
/// that verifiably exist.
async function doResearchMarket(
  cleaned: string[],
  key: string,
  context?: string,
): Promise<MarketRead> {
  const kw = cleaned.join(', ');
  const freshCutoff = new Date(Date.now() - EVIDENCE_MAX_AGE_MS).toISOString().slice(0, 10);

  const settled = await Promise.allSettled(
    SWEEP_ANGLES.map((a) =>
      payExternal<ExaResponse>(EXA_SEARCH_URL, {
        method: 'POST',
        body: {
          query: a.query(kw, context),
          numResults: 5,
          type: 'auto',
          startPublishedDate: freshCutoff,
          contents: { text: { maxCharacters: 1200 } },
        },
      }).then((r) => ({ angle: a.angle, ...r })),
    ),
  );

  const okCalls = settled.filter(
    (s): s is PromiseFulfilledResult<{ angle: string } & ExternalPayResult<ExaResponse>> =>
      s.status === 'fulfilled',
  );
  if (okCalls.length === 0) {
    const first = settled[0] as PromiseRejectedResult;
    throw new Error(`market sweep failed on every angle: ${String(first.reason).slice(0, 200)}`);
  }
  for (const s of settled) {
    if (s.status === 'rejected') {
      logger.warn({ keywords: cleaned, err: String(s.reason).slice(0, 200) }, 'sweep angle failed');
    }
  }

  const anglesRun = okCalls.map((c) => c.value.angle);
  const paidUsd = okCalls.reduce((acc, c) => acc + c.value.paidUsd, 0);
  const payer = okCalls[0]!.value.payer;
  const txHash = okCalls.find((c) => c.value.txHash)?.value.txHash;

  // Merge across angles: dedupe by URL, at most two results per domain so one
  // site's five hits can't pose as market consensus. Cap ten sources.
  const seenUrls = new Set<string>();
  const perDomain = new Map<string, number>();
  const merged: ExaResult[] = [];
  for (const call of okCalls) {
    for (const r of call.value.data.results ?? []) {
      if (!r.url || seenUrls.has(r.url)) continue;
      let domain = '';
      try {
        domain = new URL(r.url).hostname.replace(/^www\./, '');
      } catch {
        continue;
      }
      const n = perDomain.get(domain) ?? 0;
      if (n >= 2) continue;
      seenUrls.add(r.url);
      perDomain.set(domain, n + 1);
      merged.push(r);
      if (merged.length >= 10) break;
    }
    if (merged.length >= 10) break;
  }

  const sources = merged.map((r) => ({
    title: (r.title ?? r.url ?? '').slice(0, 140),
    url: r.url!,
    ...(r.publishedDate ? { publishedDate: r.publishedDate.slice(0, 10) } : {}),
  }));
  const sourceTexts = merged.map((r) => (r.text ?? '').replace(/\s+/g, ' ').trim());
  const evidence = merged
    .map((r, i) => `[${i}] ${r.title ?? ''}${r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : ''}\n${sourceTexts[i]}`)
    .join('\n\n')
    .slice(0, 12_000);

  const synth = await withLlmRetry(`marketRead(${key})`, () =>
    generateObject({
      model: researchModel,
      schema: readSchema,
      prompt: [
        'You are a trade-desk analyst. Using only the web excerpts below, write a',
        'concise market read for a B2B trade deal on these keywords:',
        kw,
        context ? `Deal context: ${context}` : '',
        '',
        'Web results (each starts with its [index]):',
        evidence || '(no usable excerpts returned)',
        '',
        'Return: a one-paragraph summary (<=70 words); demand as hot/steady/soft;',
        'a one-line price/leverage note for the side negotiating this deal; up to',
        '6 short factual highlights drawn from the results; and priceObservations:',
        'EVERY explicit price, rate or cost figure that appears in the excerpts,',
        'each with the amount converted to USDC (treat USD 1:1), the unit it',
        "prices, comparable=true only when it prices a whole deal of this type",
        '(not an hourly rate against a project deal), the VERBATIM quote from the',
        'excerpt containing the figure, and the [index] of the source quoted.',
        'Copy quotes exactly — they are verified against the sources and invented',
        'quotes are discarded. No preamble.',
      ].join('\n'),
    }),
  );

  // Code-side verification: an observation survives only if its quote really
  // appears in the source it cites. This is the wall between "the model says
  // the market price is X" and "source [2] verifiably says X".
  const { verified, priceConfidence, priceBandUsdc } = verifyPriceObservations(
    synth.object.priceObservations,
    sourceTexts,
  );

  const read: MarketRead = {
    keywords: cleaned,
    summary: synth.object.summary,
    demand: synth.object.demand,
    priceNote: synth.object.priceNote,
    fairPriceUsdc: priceConfidence === 'grounded' ? priceBandUsdc?.mid : undefined,
    priceConfidence,
    ...(priceBandUsdc ? { priceBandUsdc } : {}),
    ...(verified.length > 0 ? { priceObservations: verified } : {}),
    highlights: synth.object.highlights.slice(0, 6),
    sources,
    anglesRun,
    paidUsd,
    payer,
    txHash,
    researchedAt: Date.now(),
    cached: false,
  };
  researchCache.set(key, read);
  logger.info(
    {
      keywords: cleaned,
      demand: read.demand,
      paidUsd,
      sources: sources.length,
      angles: anglesRun.length,
      verifiedPrices: verified.length,
      priceConfidence,
    },
    'x402: market researched via Exa sweep',
  );
  return read;
}
