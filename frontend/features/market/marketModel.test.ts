import assert from 'node:assert/strict';
import test from 'node:test';
import type { DiscoveryCard } from '../discovery/model';
import { buyCards, sellRequests } from './marketModel';

/// The market's one order (view 44): real offers before examples, newest
/// first; on the Sell side, the requests that fit you first.
///
///   npx tsx --test features/market/marketModel.test.ts

const card = (id: string, o: Partial<DiscoveryCard> = {}): DiscoveryCard => ({
  side: 'offer',
  id,
  href: `/listings/${id}`,
  title: id,
  body: '',
  priceUsdc: 10,
  postedAt: 0,
  availableUntil: 0,
  partyAddress: '0xaa',
  partyKind: 'person',
  tradeLane: 'service',
  partyIsYou: false,
  matchedBefore: false,
  example: false,
  category: null,
  seller: null,
  ...o,
});

test('real offers come before examples, newest first, six of them fresh', () => {
  const cards = [
    ...Array.from({ length: 7 }, (_, i) => card(`r${i}`, { postedAt: i })),
    card('e1', { example: true, postedAt: 100 }),
    card('e2', { example: true, postedAt: 99 }),
  ];
  const { fresh, all } = buyCards(cards, { q: '', category: 'all', scope: 'all' });
  assert.deepEqual(fresh.map((c) => c.id), ['r6', 'r5', 'r4', 'r3', 'r2', 'r1']);
  assert.deepEqual(all.slice(-2).map((c) => c.id), ['e1', 'e2']);
  assert.equal(all.length, 9);
});

test('a category and a search narrow the offers; requests never show on Buy', () => {
  const cards = [
    card('iphone', { title: 'iPhone 13, 128 GB', category: 'phones' }),
    card('galaxy', { title: 'Samsung Galaxy A54', category: 'phones' }),
    card('logo', { title: 'Logo kit', category: 'design' }),
    card('want', { side: 'request', title: 'Need an iPhone', category: 'phones' }),
  ];
  assert.deepEqual(buyCards(cards, { q: 'iphone', category: 'phones', scope: 'all' }).all.map((c) => c.id), ['iphone']);
  assert.deepEqual(buyCards(cards, { q: '', category: 'phones', scope: 'all' }).all.map((c) => c.id).sort(), ['galaxy', 'iphone']);
  assert.deepEqual(buyCards(cards, { q: 'IPHONE', category: 'all', scope: 'all' }).all.map((c) => c.id), ['iphone']);
});

test('the business scope lists business offers only', () => {
  const cards = [card('p'), card('b', { partyKind: 'business' }), card('f', { tradeLane: 'finance' })];
  assert.deepEqual(buyCards(cards, { q: '', category: 'all', scope: 'business' }).all.map((c) => c.id).sort(), ['b', 'f']);
});

test('requests that fit you come first and say so; signed out nothing is marked', () => {
  const cards = [
    card('0xr1', { side: 'request', postedAt: 3 }),
    card('0xr2', { side: 'request', postedAt: 1 }),
    card('0xr3', { side: 'request', postedAt: 2 }),
    card('offer', { postedAt: 9 }),
  ];
  assert.deepEqual(sellRequests(cards, new Set(['0xr2'])).map((c) => [c.id, c.fits]), [['0xr2', true], ['0xr1', false], ['0xr3', false]]);
  assert.ok(sellRequests(cards, null).every((c) => !c.fits));
});
