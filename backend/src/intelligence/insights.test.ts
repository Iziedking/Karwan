import assert from 'node:assert/strict';
import test from 'node:test';
import { insightsFor, sentRecord, type InsightFacts, type OpenRequestFact } from './insights.js';

/// What the agent tells its person, from Karwan's own data (view 52, step 1).
///
///   npx tsx --test src/intelligence/insights.test.ts

const DAY = 86_400_000;
const NOW = 100 * DAY;
const band = { low: 40, mid: 50, high: 65, deals: 4 };

const request = (over: Partial<OpenRequestFact> = {}): OpenRequestFact => ({
  jobId: '0xreq', title: 'A landing page', category: 'tech', budgetUsdc: 50, deadlineDays: 5, postedAt: NOW - DAY / 2, offers: 1, ...over,
});

const facts = (over: Partial<InsightFacts> = {}): InsightFacts => ({
  network: 'mainnet', openRequests: [], priceMisses7d: [], lowestPriceUsdc: null, bands: { tech: band }, usualDays: {}, sent: [], ...over,
});

const kinds = (f: InsightFacts) => insightsFor(f, NOW).map((i) => i.kind);
const miss = (budgetUsdc: number) => ({ jobId: `0x${budgetUsdc}`, budgetUsdc });

test('on the test network a budget above recent prices is told, with the middle price as the action', () => {
  const [i] = insightsFor(facts({ network: 'testnet', openRequests: [request({ budgetUsdc: 100 })] }), NOW);
  assert.equal(i!.kind, 'testnet-budget');
  assert.deepEqual(i!.numbers, { budgetUsdc: 100, lowUsdc: 40, highUsdc: 65, suggestedUsdc: 50 });
  assert.deepEqual(i!.action, { kind: 'set-request-budget', jobId: '0xreq', budgetUsdc: 50 });
  assert.deepEqual(kinds(facts({ network: 'mainnet', openRequests: [request({ budgetUsdc: 100 })] })), []);
  assert.deepEqual(kinds(facts({ network: 'testnet', openRequests: [request({ budgetUsdc: 65 })] })), []);
});

test('missed requests by price need three, and only when buyers offered less than the lowest price', () => {
  assert.deepEqual(kinds(facts({ lowestPriceUsdc: 40, priceMisses7d: [miss(20), miss(25)] })), []);
  const [i] = insightsFor(facts({ lowestPriceUsdc: 40, priceMisses7d: [miss(20), miss(25), miss(30)] }), NOW);
  assert.equal(i!.kind, 'missed-by-price');
  assert.deepEqual(i!.numbers, { count: 3, buyersMedianUsdc: 25, lowestPriceUsdc: 40 });
  assert.deepEqual(i!.action, { kind: 'set-lowest-price', priceUsdc: 25 });
  assert.deepEqual(kinds(facts({ lowestPriceUsdc: 20, priceMisses7d: [miss(20), miss(25), miss(30)] })), []);
});

test('a budget below what deals settled at is told, and never without a price band', () => {
  const [i] = insightsFor(facts({ openRequests: [request({ budgetUsdc: 25 })] }), NOW);
  assert.equal(i!.kind, 'budget-below-band');
  assert.deepEqual(i!.action, { kind: 'set-request-budget', jobId: '0xreq', budgetUsdc: 40 });
  assert.deepEqual(kinds(facts({ bands: {}, openRequests: [request({ budgetUsdc: 25 })] })), []);
  assert.deepEqual(kinds(facts({ openRequests: [request({ budgetUsdc: 25, category: null })] })), []);
});

test('a request with no offer for a day, shorter than such work usually takes, is told', () => {
  const slow = request({ offers: 0, postedAt: NOW - DAY, deadlineDays: 3 });
  const [i] = insightsFor(facts({ usualDays: { tech: 7 }, openRequests: [slow] }), NOW);
  assert.equal(i!.kind, 'slow-request');
  assert.deepEqual(i!.action, { kind: 'set-request-days', jobId: '0xreq', days: 7 });
  assert.deepEqual(kinds(facts({ usualDays: { tech: 7 }, openRequests: [{ ...slow, postedAt: NOW - DAY + 1 }] })), []);
  assert.deepEqual(kinds(facts({ usualDays: { tech: 7 }, openRequests: [{ ...slow, offers: 1 }] })), []);
});

test('cheaper sellers with a record as good need two, from the offers the buyer can see', () => {
  const pendingAccept = { jobId: '0xreq', title: 'Logo', priceUsdc: 80, sellerRating: 4.2, others: [{ priceUsdc: 70, rating: 4.5 }, { priceUsdc: 65, rating: 4.2 }, { priceUsdc: 60, rating: 3.9 }] };
  const [i] = insightsFor(facts({ pendingAccept }), NOW);
  assert.equal(i!.kind, 'cheaper-better-sellers');
  assert.deepEqual(i!.numbers, { count: 2, lowestUsdc: 65, bestRating: 4.5, priceUsdc: 80 });
  assert.deepEqual(kinds(facts({ pendingAccept: { ...pendingAccept, others: pendingAccept.others.slice(1) } })), []);
});

test('never another person: numbers and the person’s own request only', () => {
  const pendingAccept = { jobId: '0xreq', title: 'Logo', priceUsdc: 80, sellerRating: 4, others: [{ priceUsdc: 70, rating: 4.5 }, { priceUsdc: 65, rating: 4.2 }] };
  for (const i of insightsFor(facts({ pendingAccept }), NOW)) {
    assert.doesNotMatch(JSON.stringify(i), /0x[0-9a-f]{40}/i);
    for (const v of Object.values(i.numbers)) assert.equal(typeof v, 'number');
  }
});

test('at most three, the biggest change first', () => {
  const f = facts({
    network: 'testnet',
    lowestPriceUsdc: 100,
    priceMisses7d: [miss(20), miss(25), miss(30)],
    usualDays: { tech: 10 },
    openRequests: [
      request({ jobId: '0xa', budgetUsdc: 25 }),
      request({ jobId: '0xb', budgetUsdc: 200 }),
      request({ jobId: '0xc', offers: 0, postedAt: NOW - 2 * DAY, deadlineDays: 2 }),
    ],
  });
  const got = insightsFor(f, NOW);
  assert.equal(got.length, 3);
  for (let k = 1; k < got.length; k++) assert.ok(got[k - 1]!.weight >= got[k]!.weight);
});

test('the same insight is not told twice in a week, unless its number moved by a tenth', () => {
  const f = facts({ openRequests: [request({ budgetUsdc: 25 })] });
  const [first] = insightsFor(f, NOW);
  const told = sentRecord(first!, NOW - DAY);
  assert.deepEqual(kinds({ ...f, sent: [told] }), []);
  assert.deepEqual(kinds({ ...f, sent: [{ ...told, at: NOW - 8 * DAY }] }), ['budget-below-band']);
  assert.deepEqual(kinds({ ...f, bands: { tech: { ...band, low: 45 } }, sent: [told] }), ['budget-below-band']);
});
