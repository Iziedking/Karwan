import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as store from '../db/meaningVectors.js';
import { createMeaningKeeper } from './meaningKeeper.js';
import { REQUEST_MEANING_WAIT_MS, requestMeaning, sellerMeaning, startMeaning } from './meaningLive.js';
import type { IndexedSeller } from './sellerIndex.js';

/// How meaning vectors join the market (view 95 phase 2): sellers are embedded
/// when the index changes, a posted request waits at most 1.5 s for its vector.
///
///   npx tsx --test src/matching/meaningLive.test.ts

const seller = (n: string, text: string, over: Partial<IndexedSeller> = {}): IndexedSeller => ({
  userAddress: `0x${n}`, sellerAddress: `0x${n}5`, words: [text], text, sector: null, shapes: [], country: null, example: false, onMarket: true, updatedAt: 1, ...over,
});

function harness(on = true) {
  store.resetMeaningVectorsForTests();
  const calls: { texts: string[]; timeoutMs?: number }[] = [];
  const keeper = createMeaningKeeper({
    on: () => on,
    model: () => 'm@2',
    threshold: () => 0.4,
    embed: async (texts, _type, timeoutMs) => (calls.push({ texts, timeoutMs }), texts.map((t) => Float32Array.from(/tailor|aso ebi/.test(t) ? [1, 0] : [0, 1]))),
    store,
    now: () => 1,
    gapMs: 0,
    sleep: async () => undefined,
  });
  let listener: ((e: IndexedSeller[], how: 'rebuild' | 'refresh') => void) | null = null;
  const index = { listen: (fn: typeof listener & object) => ((listener = fn), () => (listener = null)) };
  return { keeper, calls, index, tell: (e: IndexedSeller[], how: 'rebuild' | 'refresh') => listener?.(e, how) };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test('a rebuild loads and backfills the sellers on the market, once', async () => {
  const h = harness();
  startMeaning({ keeper: h.keeper, index: h.index, on: () => true });
  h.tell([seller('a', 'tailor'), seller('b', 'caterer', { example: true }), seller('c', 'cook', { onMarket: false })], 'rebuild');
  await settle();
  h.tell([seller('a', 'tailor'), seller('d', 'driver')], 'rebuild');
  await settle();
  assert.deepEqual(h.calls.map((c) => c.texts), [['tailor']]);
  assert.ok(h.keeper.vectorOf('seller', '0xa'));
});

test('a refresh embeds the seller once, and a second refresh with the same text makes no call', async () => {
  const h = harness();
  startMeaning({ keeper: h.keeper, index: h.index, on: () => true });
  h.tell([seller('a', 'tailor')], 'refresh');
  await settle();
  h.tell([seller('a', 'tailor')], 'refresh');
  await settle();
  assert.equal(h.calls.length, 1);
});

test('with the switch off the index changes make no call', async () => {
  const h = harness(false);
  startMeaning({ keeper: h.keeper, index: h.index, on: () => false });
  h.tell([seller('a', 'tailor')], 'rebuild');
  h.tell([seller('a', 'tailor')], 'refresh');
  await settle();
  assert.equal(h.calls.length, 0);
});

test('a posted request waits at most 1500 ms for its vector and scores sellers by meaning', async () => {
  const h = harness();
  await h.keeper.ensure({ kind: 'seller', ref: '0xa', owner: '0xa', text: 'tailor' });
  const score = await requestMeaning(h.keeper, 'job-1', '0xb', 'someone to sew aso ebi for my wedding');
  assert.equal(REQUEST_MEANING_WAIT_MS, 1500);
  assert.equal(h.calls.at(-1)?.timeoutMs, 1500);
  assert.equal(score?.('0xa'), 100);
  assert.ok(h.keeper.vectorOf('request', 'job-1'));
});

test('a request without a vector gets no scorer, so matching runs on words', async () => {
  const h = harness(false);
  assert.equal(await requestMeaning(h.keeper, 'job-1', '0xb', 'tailor'), undefined);
});

test('a seller is scored against the open requests by meaning', async () => {
  const h = harness();
  await h.keeper.ensure({ kind: 'seller', ref: '0xa', owner: '0xa', text: 'tailor' });
  await requestMeaning(h.keeper, 'job-1', '0xb', 'aso ebi for my wedding');
  await requestMeaning(h.keeper, 'job-2', '0xb', 'logo for my bakery');
  const score = sellerMeaning(h.keeper, '0xa')!;
  assert.equal(score('job-1'), 100);
  assert.equal(score('job-2'), 0);
  assert.equal(sellerMeaning(h.keeper, '0xnobody'), undefined);
});
