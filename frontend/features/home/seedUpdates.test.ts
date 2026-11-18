import assert from 'node:assert/strict';
import test from 'node:test';
import type { UpdateCard } from '@/core/api';
import { localizeSeedCard } from './seedUpdates';

const seed = {
  id: 'upd_paid_in_usdc', order: 1, kind: 'post', tag: 'Tech', title: 'Paid in USDC',
  body: 'Every deal settles in USDC issued by Circle, held in escrow until release.', ctaLabel: 'Read more', href: '/docs/escrow',
} as unknown as UpdateCard;

test('a seed card reads in the reader\'s language', () => {
  const ar = localizeSeedCard(seed, 'ar');
  assert.equal(ar.title, 'الدفع بعملة USDC');
  assert.equal(ar.href, '/docs/escrow');
  assert.equal(localizeSeedCard(seed, 'en'), seed);
});

test('a card an admin rewrote shows as written', () => {
  const rewritten = { ...seed, title: 'Our new escrow' };
  assert.equal(localizeSeedCard(rewritten, 'ar'), rewritten);
  const other = { ...seed, id: 'upd_custom' };
  assert.equal(localizeSeedCard(other, 'fr'), other);
});

test('the ways-to-deal cards read in every language, with English the same as the server gives', async () => {
  const { readFileSync } = await import('node:fs');
  const store = readFileSync(new URL('../../../backend/src/updates/store.ts', import.meta.url), 'utf8');
  for (const scene of ['open-market', 'direct', 'contest', 'hourly', 'agent-match', 'standing-order', 'pay-link', 'release']) {
    const server = store.slice(store.indexOf(`['${scene}',`));
    const line = server.slice(0, server.indexOf('\n'));
    for (const lang of ['fr', 'ar', 'hi', 'sw'] as const) {
      const card = localizeSeedCard({ ...seed, id: `upd_deal_${scene}`, ...englishFrom(line) } as UpdateCard, lang);
      assert.notEqual(card.title, englishFrom(line).title, `${scene} ${lang} reads in that language`);
    }
  }
});

/// tag, title, body and button from a DEALS line of the server's store.
function englishFrom(line: string) {
  const [, tag, title, body, ctaLabel] = [...line.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!);
  return { tag, title, body, ctaLabel };
}
