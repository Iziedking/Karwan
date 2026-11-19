import assert from 'node:assert/strict';
import test from 'node:test';
import { nearbyAsks, nearbySellers, NEARBY_MIN, type Ask } from './nearbyAsks.js';
import type { PrivateLocation } from '../location/rules.js';

/// The card on "Where are you" at setup (view 39, 19 Nov): how many people in
/// your city are asking for what you sell, shown only from three people up,
/// with a few open asks from your country that never say where the buyer is.

const at = (country: string, city: string | null): PrivateLocation => ({ country, city, area: null, reach: {} });
const ask = (buyer: string, what: string, where: PrivateLocation | null, budgetUsdc: number | null = 30, open = true): Ask => ({
  buyer, what, keywords: what.toLowerCase().split(' '), budgetUsdc, buyerLocation: where, open,
});

const asks: Ask[] = [
  ask('0xb1', 'logo for a food brand', at('NG', 'Lagos'), 32),
  ask('0xb2', 'rebrand logo for a hair salon', at('NG', 'lagos'), 58),
  ask('0xb3', 'menu and logo', at('NG', 'Lagos'), 24),
  ask('0xb3', 'second logo from the same person', at('NG', 'Lagos'), 10),
  ask('0xb4', 'logo for a church', at('NG', 'Ibadan'), 40),
  ask('0xb5', 'phone repair', at('NG', 'Lagos')),
  ask('0xb6', 'logo private', at('NG', 'Lagos'), 20, false),
  ask('0xb7', 'logo in Accra', at('GH', 'Accra')),
  ask('0xada', 'my own logo ask', at('NG', 'Lagos')),
];
const q = { me: '0xada', words: ['logo', 'design'], country: 'NG', city: 'Lagos' };

test('people in the same city asking for what you sell, each person once', () => {
  const r = nearbyAsks(asks, q);
  assert.equal(r.count, 3);
});

test('the asks shown come from the country and never carry a place', () => {
  const r = nearbyAsks(asks, q);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows[0], { what: 'logo for a food brand', budgetUsdc: 32 });
  assert.ok(r.rows.every((row) => Object.keys(row).sort().join() === 'budgetUsdc,what'));
});

test('fewer than three people shows nothing', () => {
  assert.equal(NEARBY_MIN, 3);
  const two = asks.filter((a) => a.buyer !== '0xb3');
  assert.deepEqual(nearbyAsks(two, q), { count: 0, rows: [] });
});

test('no city, or no words, shows nothing', () => {
  assert.deepEqual(nearbyAsks(asks, { ...q, city: null }), { count: 0, rows: [] });
  assert.deepEqual(nearbyAsks(asks, { ...q, words: [] }), { count: 0, rows: [] });
});

test('sellers near a buyer are counted, never listed', () => {
  const sellers = [
    { user: '0xs1', words: ['logo', 'design'], location: at('NG', 'Lagos') },
    { user: '0xs2', words: ['brand', 'logo'], location: at('NG', 'Lagos') },
    { user: '0xs3', words: ['logo'], location: at('NG', 'LAGOS') },
    { user: '0xs4', words: ['logo'], location: at('NG', 'Abuja') },
    { user: '0xs5', words: ['plumbing'], location: at('NG', 'Lagos') },
  ];
  assert.deepEqual(nearbySellers(sellers, q), { count: 3, rows: [] });
  assert.deepEqual(nearbySellers(sellers.slice(0, 2), q), { count: 0, rows: [] });
});
