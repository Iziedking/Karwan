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
