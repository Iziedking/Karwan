import { bridgedWords, textWords } from '../llm/keywords.js';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'for', 'from', 'get', 'good', 'have', 'help', 'hire',
  'i', 'in', 'into', 'is', 'it', 'need', 'of', 'on', 'or', 'our', 'please',
  'account', 'accounts', 'buy', 'buying', 'deal', 'deals', 'digital', 'online',
  'sale', 'sales', 'service', 'services', 'the', 'this', 'to', 'want', 'with',
  'work', 'you',
]);

export function normalizeTerms(values: readonly string[]): string[] {
  return [...new Set(
    values
      .flatMap(textWords)
      .filter((value) => !STOPWORDS.has(value)),
  )].sort();
}

export function skillCoverage(required: readonly string[], offered: readonly string[]): number {
  const wanted = normalizeTerms(required);
  const available = normalizeTerms(offered);
  // A wanted word that reaches a word-map group the offer also hits is covered
  // (view 95); a short or filler word of that name joins both sides of the sum.
  const bridged = bridgedWords(required, offered);
  const extra = [...bridged].filter((w) => !wanted.includes(w)).length;
  if (wanted.length + extra === 0 || (available.length === 0 && bridged.size === 0)) return 0;
  let covered = extra;
  for (const term of wanted) {
    if (bridged.has(term) || available.some((other) => other === term || other.includes(term) || term.includes(other))) {
      covered += 1;
    }
  }
  return Math.round((covered / (wanted.length + extra)) * 100);
}

export function containsProhibitedCategory(
  prohibited: readonly string[] | undefined,
  candidateTerms: readonly string[],
): boolean {
  const blocked = normalizeTerms(prohibited ?? []);
  const candidate = normalizeTerms(candidateTerms);
  return blocked.some((term) => candidate.some((other) => other === term || other.includes(term) || term.includes(other)));
}
