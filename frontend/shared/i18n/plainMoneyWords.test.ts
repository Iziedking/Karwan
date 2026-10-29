import assert from 'node:assert/strict';
import test from 'node:test';
import { MESSAGES } from './messages/all';

/// Money locked behind deals is a Deal guarantee (view 37). Staking, vault and
/// insurance words never reach a screen, in any language.
///
///   npx tsx --test shared/i18n/plainMoneyWords.test.ts

const WORDS: Record<keyof typeof MESSAGES, RegExp> = {
  en: /\b(stak\w*|unstak\w*|vaults?|insurance|insured)\b|KarwanVault/i,
  fr: /\bstak\w*|\bvaults?\b|KarwanVault|\bcoffres?\b|mise en jeu|assurance (des|de) transaction/i,
  ar: /رهن|مرهون|KarwanVault|\bstak\w*/i,
  hi: /स्टेक|वॉल्ट|बीमा|KarwanVault|\bstak\w*/i,
  sw: /\brehani\b|\bbima\b|KarwanVault|\bstak\w*|\bvaults?\b/i,
};

/// Real uses of these words that are not about the deal guarantee.
const ALLOWED = [
  // Incoterms: CIF is "cost, insurance and freight", a trade term.
  'tradeTerms.incotermGloss.CIF',
  // The brand page lists words to avoid, insurance among them.
  'brandPage.voice.wordsWeAvoidBody',
  // A rental's refundable deposit, not a guarantee.
  'ways.',
];

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}.${i}`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
}

for (const locale of Object.keys(MESSAGES) as Array<keyof typeof MESSAGES>) {
  test(`no staking words on screen in ${locale}`, () => {
    const found = [...strings(MESSAGES[locale], '')]
      .filter(([path, text]) => WORDS[locale].test(text) && !ALLOWED.some((allowed) => path.startsWith(allowed)))
      .map(([path, text]) => `${path}: ${text.slice(0, 90)}`);
    assert.deepEqual(found, []);
  });
}
