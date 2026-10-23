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
