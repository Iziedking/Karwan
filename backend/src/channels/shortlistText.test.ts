import assert from 'node:assert/strict';
import test from 'node:test';
import { shortlistText } from './shortlistText.js';
import type { ShortlistEntry } from '../agents/shortlist.js';

const entry = (over: Partial<ShortlistEntry>): ShortlistEntry => ({
  rank: 1,
  seller: '0xs',
  sellerUser: '0xu',
  name: 'Ada Okafor',
  tag: 'ada',
  level: 'work_verified',
  verified: true,
  score: 82,
  tier: 'STRONG',
  counts: { completed: 12, onTimeRate: 92, disputesLost: 0 },
  offer: 'Landing page',
  deliveryDays: 5,
  priceUsdc: 80,
  askedUsdc: 95,
  recordChecked: true,
  recommended: true,
  reasons: ['verified'],
  state: 'ready',
  isNew: false,
  ...over,
});

const kemi = entry({ rank: 2, name: 'Kemi B.', tag: null, level: 'registered', verified: false, score: 12, tier: 'NEW', counts: { completed: 0, onTimeRate: null, disputesLost: 0 }, priceUsdc: 60, askedUsdc: null, recordChecked: false, recommended: false, reasons: [] });

test('each row shows level and tier, never a score, with price and the numbers it was given, and one recommendation', () => {
  const text = shortlistText([entry({}), kemi], 'https://karwan.site', { readsBalanceEmpty: false });
  assert.match(text, /1\. Ada Okafor @ada · Recommended/);
  assert.match(text, /Verified · Strong\n/);
  assert.doesNotMatch(text, /· 82/);
  assert.match(text, /Landing page, 5 days · 80 USDC \(asked 95\)/);
  assert.match(text, /12 completed deals · 92% on time · 0 disputes lost · Record checked/);
  assert.match(text, /Profile: https:\/\/karwan\.site\/r\/ada/);
  assert.match(text, /2\. Kemi B\.\nNot verified · New\n/);
  assert.match(text, /No completed deals yet/);
  assert.match(text, /Reply with a number to choose/);
  assert.equal(text.match(/Recommended/g)?.length, 1);
  assert.doesNotMatch(text, /—/);
});

test('an unavailable row says so, and an empty reads balance is said once at the top', () => {
  const text = shortlistText([entry({ state: 'unavailable', recommended: false })], 'https://karwan.site', { readsBalanceEmpty: true });
  assert.match(text, /^Your agent could not check records for this list/);
  assert.match(text, /No longer available/);
});

test('an empty list says nobody has offered yet', () => {
  assert.match(shortlistText([], 'https://karwan.site', { readsBalanceEmpty: false }), /No one has offered yet/);
});

test('a list with no recommendation says none is verified yet', () => {
  assert.match(shortlistText([kemi], 'https://karwan.site', { readsBalanceEmpty: false }), /None of these sellers is verified yet/);
});

test('an empty record checks balance points to topping up the buying agent, the only way it refills', () => {
  const text = shortlistText([], 'https://karwan.site', { readsBalanceEmpty: true });
  assert.match(text, /top up your buying agent/i);
  assert.doesNotMatch(text, /Add 0\.10 USDC/);
});

test('a sealed shortlist row in chat shows level, tier and reasons, and no numbers', async () => {
  const { sealEntries } = await import('../agents/shortlist.js');
  const [sealed] = sealEntries([entry({})]);
  const text = shortlistText([sealed!], 'https://karwan.site', { readsBalanceEmpty: false });
  assert.match(text, /Verified · Strong\n/);
  assert.doesNotMatch(text, /completed deals|on time|disputes lost|82/);
});

test('the live shortlist event carries sealed rows once records are sealed', async () => {
  const { readFileSync } = await import('node:fs');
  const buyer = readFileSync(new URL('../agents/buyer.ts', import.meta.url), 'utf8');
  const fn = buyer.slice(buyer.indexOf('function shortlistPayload('), buyer.indexOf('function shortlistDeps('));
  assert.match(fn, /config\.SEALED_RECORDS \? sealEntries\(/);
});

test('in chat, an offer above the budget and an unlinked agent are marked (view 41)', () => {
  const text = shortlistText(
    [entry({ rank: 1, outsideRequest: true }), entry({ rank: 2, name: 'Kemi B.', mustLink: true })],
    'https://karwan.site',
    { readsBalanceEmpty: false },
  );
  assert.match(text, /Above your budget, outside your request/);
  assert.match(text, /Not linked to their account yet\. You can choose them once they link it\./);
});
