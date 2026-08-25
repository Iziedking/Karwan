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
      .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
      .map((value) => value.trim())
      .filter((value) => value.length >= 3 && !STOPWORDS.has(value)),
  )].sort();
}

export function skillCoverage(required: readonly string[], offered: readonly string[]): number {
  const wanted = normalizeTerms(required);
  const available = normalizeTerms(offered);
  if (wanted.length === 0 || available.length === 0) return 0;
  let covered = 0;
  for (const term of wanted) {
    if (available.some((other) => other === term || other.includes(term) || term.includes(other))) {
      covered += 1;
    }
  }
  return Math.round((covered / wanted.length) * 100);
}

export function containsProhibitedCategory(
  prohibited: readonly string[] | undefined,
  candidateTerms: readonly string[],
): boolean {
  const blocked = normalizeTerms(prohibited ?? []);
  const candidate = normalizeTerms(candidateTerms);
  return blocked.some((term) => candidate.some((other) => other === term || other.includes(term) || term.includes(other)));
}
