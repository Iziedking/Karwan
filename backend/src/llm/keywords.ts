import { generateObject } from 'ai';
import { z } from 'zod';
import { llmModel } from './client.js';
import { withLlmRetry } from '../agents/llm-utils.js';
import { logger } from '../logger.js';

const keywordSchema = z.object({
  keywords: z
    .array(z.string().min(1).max(40))
    .min(1)
    .max(12)
    .describe(
      'Short canonical tags (1-3 words each), lowercase, no punctuation. ' +
        'Include the literal topic, close synonyms, common abbreviations, AND ' +
        'related roles or services that can plausibly fulfill or supply the ' +
        'same thing. Example: brief "I need API service" → ' +
        '["api", "api service", "backend", "backend engineer", "backend developer", ' +
        '"software developer", "rest api", "web service"]. Example: profile ' +
        '"Backend Engineer" → ["backend", "backend engineer", "engineer", ' +
        '"developer", "software", "api", "rest api", "web service"].',
    ),
});

const PROMPT_PREFIX = [
  'Extract 6-12 canonical match tags from the input.',
  '',
  'These tags match a BUYER asking for a service with a SELLER who can fulfill it.',
  'Buyers and sellers often describe the same thing in different words. A buyer says',
  '"API service"; a seller says "backend engineer". The tags must BRIDGE THAT GAP so',
  'both sides land on at least one shared token under the substring matcher downstream.',
  '',
  'For each input, include:',
  '  1. The literal topic and close synonyms.',
  '  2. Common abbreviations and alternate spellings.',
  '  3. RELATED ROLES, SKILLS, or PRODUCT TYPES that can plausibly fulfill or supply',
  '     the same thing. A "Backend Engineer" profile expands to "api", "rest api",',
  '     "web service". An "API service" request expands to "backend", "developer",',
  '     "engineer", "software".',
  '',
  'Stay grounded in the input. Do not invent unrelated industries.',
  'Lowercase, no punctuation, 1-3 words each, 6-12 tags total.',
].join('\n');

/// Extract canonical match tags from arbitrary text. On any LLM failure it falls
/// back to a deterministic keyword pull from the text itself, so the topical
/// gate downstream is never blinded just because the extractor model hiccuped
/// (docs/agent.md, rule R1). Returns [] only when the text has nothing usable.
export async function extractKeywords(text: string, label = 'keywords'): Promise<string[]> {
  const cleaned = text.trim();
  if (cleaned.length < 3) return [];
  try {
    const result = await withLlmRetry(label, () =>
      generateObject({
        model: llmModel,
        schema: keywordSchema,
        prompt: `${PROMPT_PREFIX}\n\nInput:\n${cleaned}`,
      }),
    );
    const tags = result.object.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
    return tags.length > 0 ? tags : naiveKeywords(cleaned);
  } catch (err) {
    logger.warn({ label, err: (err as Error).message }, 'keyword extraction failed; using naive fallback');
    return naiveKeywords(cleaned);
  }
}

/// Common request/filler words to drop from the naive fallback, on top of the
/// generic commerce filler. Not exhaustive, just enough to keep the signal words.
const NAIVE_STOPWORDS = new Set([
  'need', 'want', 'looking', 'hire', 'hiring', 'get', 'please', 'help', 'someone',
  'good', 'have', 'this', 'that', 'from', 'into', 'will', 'can', 'are', 'you',
  'who', 'any', 'one', 'out', 'now', 'not',
]);

/// Deterministic fallback: significant words from the text, generic commerce and
/// request filler dropped, deduped, capped. "i need an amazon account" -> ["amazon"].
function naiveKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC_TAG_WORDS.has(w) && !NAIVE_STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 8);
}

/// Generic commerce / filler words that two unrelated listings often share
/// ("sell an account", "good service") but which say nothing about the actual
/// topic. Stripped before a topical check so a bare "account" can't make an
/// Amazon-account request look like a match for an outlier-account seller.
const GENERIC_TAG_WORDS = new Set([
  'account', 'accounts', 'service', 'services', 'sale', 'sales', 'sell',
  'selling', 'buy', 'buying', 'work', 'job', 'online', 'digital', 'deal',
  'deals', 'fast', 'cheap', 'good', 'quality', 'best', 'new', 'used', 'the',
  'and', 'for', 'with', 'your', 'our', 'all', 'kinds',
]);

/// Topical overlap that ignores generic commerce filler, so a shared word like
/// "account" or "service" can't on its own make two unrelated listings look
/// related. Splits multi-word tags into words, drops the filler and very short
/// tokens, then runs the normal substring overlap on what's left.
///   "amazon account" vs "outlier account"  -> 0 (only the generic "account" was shared)
///   "amazon account" vs "amazon seller"     -> 1 ("amazon" is meaningful)
export function topicalOverlap(a: string[], b: string[]): number {
  const meaningful = (tags: string[]): string[] =>
    tags
      .flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/))
      .filter((w) => w.length >= 3 && !GENERIC_TAG_WORDS.has(w));
  return keywordOverlap(meaningful(a), meaningful(b));
}

/// Coverage-based 0-100 match score: of the meaningful terms the brief asks
/// for, what fraction does this seller's tags cover. This is the ranking signal
/// the buyer agent uses to put the best skill fit first, ahead of price and
/// reputation. A "data science / machine learning" brief scores a seller whose
/// tags carry those words near 100; a "data analyst" who only shares "data"
/// scores low. Generic commerce filler is stripped first, same as topicalOverlap,
/// so a shared "account" or "service" can't inflate the match. Returns 0 when
/// either side has no meaningful tags (caller treats that as "can't assess").
export function topicalMatchScore(briefTags: string[], sellerTags: string[]): number {
  const meaningful = (tags: string[]): string[] =>
    Array.from(
      new Set(
        tags
          .flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/))
          .filter((w) => w.length >= 3 && !GENERIC_TAG_WORDS.has(w)),
      ),
    );
  const brief = meaningful(briefTags);
  const seller = meaningful(sellerTags);
  if (brief.length === 0 || seller.length === 0) return 0;
  let matched = 0;
  for (const term of brief) {
    if (seller.some((s) => s === term || s.includes(term) || term.includes(s))) matched += 1;
  }
  return Math.round((matched / brief.length) * 100);
}

/// LLM relevance bridge for the topical-zero case. When the deterministic
/// substring matcher finds no shared tokens between a brief and a seller
/// profile but they could still be a real fit (buyer asks "API service",
/// seller says "Backend Engineer", neither token substrings the other), this
/// asks the LLM in plain English. Cached per (briefTags, sellerTags, profile)
/// so repeated checks across multiple agents on the same brief are free.
const relevanceSchema = z.object({
  relevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(200),
});

interface RelevanceJudgement {
  relevant: boolean;
  confidence: number;
  reasoning: string;
}

const relevanceCache = new Map<string, { value: RelevanceJudgement; expiresAt: number }>();
const RELEVANCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RELEVANCE_CACHE_MAX = 1000;

function relevanceKey(input: {
  briefTags: string[];
  sellerTags: string[];
  sellerProfile: string;
}): string {
  const brief = [...input.briefTags].map((t) => t.toLowerCase()).sort().join('|');
  const seller = [...input.sellerTags].map((t) => t.toLowerCase()).sort().join('|');
  return `${brief}::${seller}::${input.sellerProfile.slice(0, 80)}`;
}

export async function judgeRelevance(input: {
  briefText?: string;
  briefTags: string[];
  sellerProfile: string;
  sellerTags: string[];
}): Promise<RelevanceJudgement> {
  const key = relevanceKey(input);
  const cached = relevanceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const prompt = [
    'You decide whether a seller can plausibly fulfill a buyer request.',
    '',
    'Buyer request:',
    `  text: ${input.briefText ?? '(opaque, only the tags below)'}`,
    `  tags: ${input.briefTags.join(', ')}`,
    '',
    'Seller profile:',
    `  description: ${input.sellerProfile}`,
    `  tags: ${input.sellerTags.join(', ')}`,
    '',
    'Could this seller credibly fulfill this request? Reason in plain English.',
    'YES examples:',
    '  - Brief "API service" + profile "Backend Engineer" → YES, backend engineers build APIs.',
    '  - Brief "logo design" + profile "Brand designer" → YES, brand designers do logos.',
    'NO examples:',
    '  - Brief "I need API service" + profile "Crypto trader" → NO, unrelated domains.',
    '  - Brief "logo design" + profile "Spanish translator" → NO, different skill.',
    '',
    'Set relevant: true ONLY if the seller can actually do the work, not because',
    'a single shared filler word like "service" or "online" appears on both sides.',
    'Set confidence: 0.85+ when obvious, 0.6-0.85 when reasonable, below 0.6 when shaky.',
  ].join('\n');

  let value: RelevanceJudgement;
  try {
    const r = await withLlmRetry('judgeRelevance', () =>
      generateObject({ model: llmModel, schema: relevanceSchema, prompt }),
    );
    value = r.object;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'judgeRelevance LLM call failed; defaulting to not relevant',
    );
    value = { relevant: false, confidence: 0, reasoning: 'relevance check unavailable' };
  }

  if (relevanceCache.size >= RELEVANCE_CACHE_MAX) {
    const oldest = relevanceCache.keys().next().value;
    if (oldest) relevanceCache.delete(oldest);
  }
  relevanceCache.set(key, { value, expiresAt: Date.now() + RELEVANCE_CACHE_TTL_MS });
  return value;
}

/// Cheap overlap score: count of shared tokens between two tag lists.
/// Substring matches count too so "morse" matches "morse-wl" etc.
export function keywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const A = a.map((s) => s.toLowerCase());
  const B = b.map((s) => s.toLowerCase());
  let n = 0;
  for (const x of A) {
    for (const y of B) {
      if (x === y || x.includes(y) || y.includes(x)) {
        n += 1;
        break;
      }
    }
  }
  return n;
}
