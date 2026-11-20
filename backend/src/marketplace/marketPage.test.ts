import assert from 'node:assert/strict';
import test from 'node:test';
import { MARKET_PAGE_MAX, marketPage, type MarketRow } from './marketPage.js';

const NOW = 1_000_000;
const row = (id: string, over: Partial<MarketRow> = {}): MarketRow => ({
  id, title: id, description: '', postedAt: 10, example: false, category: null, ...over,
});

test('real offers come before examples, newest first', () => {
  const rows = [row('old', { postedAt: 1 }), row('ex', { postedAt: 99, example: true }), row('new', { postedAt: 50 })];
  assert.deepEqual(marketPage(rows, { limit: 10, now: NOW }).rows.map((r) => r.id), ['new', 'old', 'ex']);
});

test('withdrawn and expired offers stay off the page', () => {
  const rows = [row('open', { expiresAt: NOW + 1 }), row('gone', { expiresAt: NOW }), row('pulled', { cancelledAt: 5 })];
  assert.deepEqual(marketPage(rows, { limit: 10, now: NOW }).rows.map((r) => r.id), ['open']);
});

test('category, business scope and search words narrow the page like the page does', () => {
  const rows = [
    row('iphone', { title: 'iPhone 13', category: 'phones' }),
    row('galaxy', { title: 'Galaxy', description: 'A clean IPHONE alternative', category: 'phones' }),
    row('logo', { title: 'Logo', category: 'design', partyKind: 'business' }),
    row('cocoa', { title: 'Cocoa', tradeLane: 'finance' }),
  ];
  assert.deepEqual(marketPage(rows, { q: 'iphone', category: 'phones', limit: 10, now: NOW }).rows.map((r) => r.id).sort(), ['galaxy', 'iphone']);
  assert.deepEqual(marketPage(rows, { q: '  IPHONE 13 ', limit: 10, now: NOW }).rows.map((r) => r.id), ['iphone']);
  assert.deepEqual(marketPage(rows, { scope: 'business', limit: 10, now: NOW }).rows.map((r) => r.id).sort(), ['cocoa', 'logo']);
  assert.deepEqual(marketPage(rows, { category: 'all', limit: 10, now: NOW }).total, 4);
});

test('the page is cut to the limit and counts everything that matched', () => {
  const rows = Array.from({ length: 300 }, (_, i) => row(`r${String(i - 200).padStart(3, '0')}`, { postedAt: i - 200 }));
  const first = marketPage(rows, { limit: 6, now: NOW });
  assert.equal(first.total, 300);
  assert.deepEqual(first.rows.map((r) => r.id), ['r099', 'r098', 'r097', 'r096', 'r095', 'r094']);
  assert.deepEqual(marketPage(rows, { limit: 2, offset: 6, now: NOW }).rows.map((r) => r.id), ['r093', 'r092']);
  assert.equal(marketPage(rows, { limit: 10_000, now: NOW }).rows.length, MARKET_PAGE_MAX);
});

test('since keeps only offers listed at or after it, and the count follows', () => {
  const rows = [row('a', { postedAt: 100 }), row('b', { postedAt: 200 }), row('c', { postedAt: 300 })];
  const page = marketPage(rows, { since: 200, limit: 10, now: NOW });
  assert.deepEqual(page.rows.map((r) => r.id), ['c', 'b']);
  assert.equal(page.total, 2);
});

test('oldest first reverses the time order, examples still last', () => {
  const rows = [row('new', { postedAt: 300 }), row('ex', { postedAt: 1, example: true }), row('old', { postedAt: 100 })];
  assert.deepEqual(marketPage(rows, { order: 'oldest', limit: 10, now: NOW }).rows.map((r) => r.id), ['old', 'new', 'ex']);
});

test('closing soonest orders by expiry, offers that never expire last, examples after real ones', () => {
  const rows = [
    row('never', { postedAt: 500 }),
    row('late', { expiresAt: NOW + 900 }),
    row('soon', { expiresAt: NOW + 10 }),
    row('ex', { expiresAt: NOW + 1, example: true }),
  ];
  assert.deepEqual(marketPage(rows, { order: 'closing', limit: 10, now: NOW }).rows.map((r) => r.id), ['soon', 'late', 'never', 'ex']);
});
