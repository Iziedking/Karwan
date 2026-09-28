import assert from 'node:assert/strict';
import test from 'node:test';
import { accountKey, buildSeedPlan, interleave, SEED_PREFIX } from './plan.js';

const emails = ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'e@example.com'];

test('every account gets 150 offers and 50 requests, 200 in all', () => {
  const plan = buildSeedPlan(emails);
  for (const account of plan) {
    assert.equal(account.offers.length, 150);
    assert.equal(account.requests.length, 50);
  }
});

test('seed keys are unique, stable across runs and carry no email', () => {
  const first = buildSeedPlan(emails).flatMap((a) => [...a.offers, ...a.requests].map((i) => i.seedKey));
  const second = buildSeedPlan(emails).flatMap((a) => [...a.offers, ...a.requests].map((i) => i.seedKey));
  assert.equal(new Set(first).size, first.length);
  assert.deepEqual(first, second);
  for (const key of first) {
    assert.ok(key.startsWith(SEED_PREFIX), key);
    assert.doesNotMatch(key, /@|example/);
  }
  assert.equal(accountKey('A@Example.com '), accountKey('a@example.com'));
});

test('no two requests read the same and nothing carries an em dash', () => {
  const plan = buildSeedPlan(emails);
  const briefs = plan.flatMap((a) => a.requests.map((r) => r.brief));
  assert.equal(new Set(briefs).size, briefs.length);
  const text = plan.flatMap((a) => [...a.offers.map((o) => `${o.title} ${o.description}`), ...briefs]);
  for (const t of text) assert.doesNotMatch(t, /—/);
});

test('an account never requests what it sells itself, and prices are whole positive amounts', () => {
  for (const account of buildSeedPlan(emails)) {
    for (const request of account.requests) assert.ok(!account.specialties.includes(request.specialty));
    for (const o of account.offers) assert.ok(Number.isInteger(o.askingPriceUsdc) && o.askingPriceUsdc > 0);
    for (const r of account.requests) assert.ok(Number.isInteger(r.budgetUsdc) && r.budgetUsdc > 0 && r.deadlineDays >= 21);
  }
});

test('the posting order mixes accounts instead of 200 in a row from one seller', () => {
  const order = interleave(buildSeedPlan(emails));
  assert.equal(order.length, 1000);
  assert.equal(new Set(order.slice(0, 5).map((i) => i.account)).size, 5);
});

test('more accounts than specialty groups is refused', () => {
  assert.throws(() => buildSeedPlan([...emails, 'f@example.com']));
});

test('the market spans every client region, on-site work stays where the team is, and goods ship from Lagos', async () => {
  const { SERVICE_MARKETS, ONSITE_CITIES, SPECIALTIES } = await import('./catalog.js');
  const plan = buildSeedPlan(emails);
  const offers = plan.flatMap((a) => a.offers);
  for (const m of SERVICE_MARKETS) assert.ok(offers.some((o) => o.title.endsWith(`for clients in ${m.name}`)), m.name);
  const briefs = plan.flatMap((a) => a.requests.map((r) => r.brief));
  for (const m of SERVICE_MARKETS) assert.ok(briefs.some((b) => b.endsWith(`in ${m.name}.`)), `requests from ${m.name}`);
  const onsiteTitles = new Set(SPECIALTIES.flatMap((s) => s.offers.filter((o) => o[3]).map((o) => o[0])));
  for (const o of offers) {
    const base = [...onsiteTitles].find((t) => o.title.startsWith(`${t} `));
    if (base) assert.ok(ONSITE_CITIES.some((c) => o.title === `${base} in ${c.name}`), o.title);
  }
  const goods = offers.filter((o) => SPECIALTIES.find((s) => s.id === o.specialty)?.lane === 'goods');
  assert.equal(goods.length, 150);
  for (const g of goods) assert.match(g.description, /Lagos/);
});

test('each account covers five specialties, 25 across the market', () => {
  const plan = buildSeedPlan(emails);
  for (const a of plan) assert.equal(new Set(a.offers.map((o) => o.specialty)).size, 5);
  assert.equal(new Set(plan.flatMap((a) => a.offers.map((o) => o.specialty))).size, 25);
});
