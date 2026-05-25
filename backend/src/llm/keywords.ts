import { generateObject } from 'ai';
import { z } from 'zod';
import { llmModel } from './client.js';
import { withLlmRetry } from '../agents/llm-utils.js';
import { logger } from '../logger.js';

const keywordSchema = z.object({
  keywords: z
    .array(z.string().min(1).max(40))
    .min(1)
    .max(8)
    .describe(
      'Short canonical tags (1-3 words each), lowercase, no punctuation. ' +
        'Include category, product names, common abbreviations, and synonyms ' +
        'a counterparty might write. Example: brief "I want to buy a Morse WL" ' +
        '→ ["nft", "whitelist", "morse", "wl"].',
    ),
});

const PROMPT_PREFIX =
  'Extract 3-6 short canonical tags from the input. Tags identify the topic, ' +
  'product, or service so two parties looking for the same thing can be matched. ' +
  'Include common synonyms and abbreviations. Lowercase, no punctuation, 1-3 words each. ' +
  'Do not invent unrelated tags; stay close to the input.';

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
