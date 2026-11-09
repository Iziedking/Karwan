import assert from 'node:assert/strict';
import test from 'node:test';
import type { FindCandidate } from '../find/rank.js';
import { findForAgent } from './match.js';

/// Outside agents find people with the same ranking as the assistant (view 72).

const seller = (user: string, over: Partial<FindCandidate> = {}): FindCandidate => ({
  user, sellerAgent: `${user}-agent`, name: `Name ${user}`, tag: user, words: ['logo', 'design'],
  meet: { atMyPlace: false, comeToYouKm: null, online: true },
  location: { country: 'NG', city: 'Abuja', area: 'Wuse 2', reach: {}, point: { lat: 9.07, lng: 7.479, precision: 'area', source: 'osm', at: 1 } },
  verified: false, tier: 'ESTABLISHED', rating: { kind: 'new', count: 0 }, price: { min: 30, usual: 45 }, days: { min: 2, max: 4 },
  onTimeRate: null, completed: 0, disputesLost: 0, contactFrom: 'anyone', outsideAgents: true, ...over,
});

const find = (cands: FindCandidate[], over: Partial<{ budgetUsdc: number; deadlineDays: number }> = {}) =>
  findForAgent({ need: 'logo design', budgetUsdc: 50, deadlineDays: 5, agentAddress: '0xoutside', ...over }, { candidates: async () => cands, cleanRecordCounts: false, requireVerified: false });

test('sealed rows: tag, tier, rating, reasons, price and days, never where anyone is', async () => {
  const [row] = await find([seller('ada', { verified: true })]);
  assert.deepEqual(Object.keys(row!).sort(), ['days', 'name', 'priceUsdc', 'rating', 'reasons', 'recommended', 'tag', 'tier', 'verified']);
  assert.equal(row!.tag, '@ada');
  assert.equal(row!.priceUsdc, '45');
  assert.equal(row!.days, 4);
  assert.equal(row!.recommended, true);
  assert.equal(JSON.stringify(row).includes('Abuja'), false);
});

test('people who keep outside agents out, have no tag, work only in person or cannot make the date are not found', async () => {
  const rows = await find([
    seller('closed', { outsideAgents: false }),
    seller('notag', { tag: null }),
    seller('shop', { meet: { atMyPlace: true, comeToYouKm: null, online: false } }),
    seller('slow', { days: { min: 9, max: 12 } }),
    seller('ok'),
  ]);
  assert.deepEqual(rows.map((r) => r.tag), ['@ok']);
});

test('a seller with no price is offered at the budget, inside the deadline', async () => {
  const [row] = await find([seller('quote', { price: null, days: null })]);
  assert.equal(row!.priceUsdc, '50');
  assert.equal(row!.days, 5);
});
