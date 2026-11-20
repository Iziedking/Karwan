import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import * as store from '../db/meaningVectors.js';
import type { InputType } from '../llm/embedder.js';
import { textHash } from './meaning.js';
import { createMeaningKeeper, type KeeperDeps } from './meaningKeeper.js';

/// The keeper of meaning vectors (view 95 phase 2), on a stub model and the
/// memory store.
///
///   npx tsx --test src/matching/meaningKeeper.test.ts

beforeEach(() => store.resetMeaningVectorsForTests());

interface Call { texts: string[]; inputType: InputType }

function setup(over: Partial<KeeperDeps> = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let on = true;
  const deps: KeeperDeps = {
    on: () => on,
    model: () => 'm@2',
    threshold: () => 0.4,
    embed: async (texts, inputType) => {
      calls.push({ texts, inputType });
      return texts.map((t) => Float32Array.from(t.includes('tailor') ? [1, 0] : [0, 1]));
    },
    store,
    now: () => 1000,
    gapMs: 7,
    sleep: async (ms) => void sleeps.push(ms),
    ...over,
  };
  return { keeper: createMeaningKeeper(deps), calls, sleeps, switchOff: () => (on = false) };
}

const seller = (ref: string, text: string) => ({ kind: 'seller' as const, ref, owner: ref, text });

test('saving the same text makes no new call', async () => {
  const { keeper, calls } = setup();
  await keeper.ensure(seller('0xa', 'tailor, native wears'));
  await keeper.ensure(seller('0xa', 'Tailor, native wears '));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.inputType, 'search_document');
  assert.ok(keeper.vectorOf('seller', '0xa'));
});

test('a changed text is embedded again', async () => {
  const { keeper, calls } = setup();
  await keeper.ensure(seller('0xa', 'tailor'));
  await keeper.ensure(seller('0xa', 'caterer'));
  assert.equal(calls.length, 2);
  assert.deepEqual([...keeper.vectorOf('seller', '0xa')!], [0, 1]);
  assert.equal((await store.getVector('seller', '0xa', 'm@2'))?.textHash, textHash('caterer'));
});

test('a vector saved earlier is read instead of made again', async () => {
  await store.putVector({ kind: 'seller', ref: '0xa', model: 'm@2', owner: '0xa', textHash: textHash('tailor'), vector: Float32Array.from([1, 0]), updatedAt: 1 });
  const { keeper, calls } = setup();
  assert.equal(await keeper.load(), 1);
  await keeper.ensure(seller('0xa', 'tailor'));
  assert.equal(calls.length, 0);
});

test('vectors from another model are ignored', async () => {
  await store.putVector({ kind: 'seller', ref: '0xa', model: 'old@2', owner: '0xa', textHash: textHash('tailor'), vector: Float32Array.from([1, 0]), updatedAt: 1 });
  const { keeper, calls } = setup();
  assert.equal(await keeper.load(), 0);
  assert.equal(keeper.vectorOf('seller', '0xa'), null);
  await keeper.ensure(seller('0xa', 'tailor'));
  assert.equal(calls.length, 1);
});

test('with the switch off nothing is called and nothing is read', async () => {
  const { keeper, calls, switchOff } = setup();
  await keeper.ensure(seller('0xa', 'tailor'));
  switchOff();
  await keeper.ensure(seller('0xb', 'tailor'));
  assert.equal(await keeper.query('tailor', { timeoutMs: 100 }), null);
  assert.equal(keeper.vectorOf('seller', '0xa'), null);
  assert.equal(keeper.scorer(Float32Array.from([1, 0]), 'seller'), undefined);
  assert.equal(calls.length, 1);
});

test('an older reply never overwrites a newer text', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let n = 0;
  const { keeper } = setup({
    embed: async (texts) => {
      n += 1;
      if (n === 1) await gate;
      return texts.map((t) => Float32Array.from(t.includes('tailor') ? [1, 0] : [0, 1]));
    },
  });
  const first = keeper.ensure(seller('0xa', 'tailor'));
  await keeper.ensure(seller('0xa', 'caterer'));
  release();
  await first;
  assert.deepEqual([...keeper.vectorOf('seller', '0xa')!], [0, 1]);
  assert.equal((await store.getVector('seller', '0xa', 'm@2'))?.textHash, textHash('caterer'));
});

test('a reply after the account is forgotten is not written back', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { keeper } = setup({ embed: async (texts) => (await gate, texts.map(() => Float32Array.from([1, 0]))) });
  const pending = keeper.ensure(seller('0xa', 'tailor'));
  await keeper.forget('0xA');
  release();
  await pending;
  assert.equal(keeper.vectorOf('seller', '0xa'), null);
  assert.equal(await store.getVector('seller', '0xa', 'm@2'), null);
});

test('backfill sends at most 96 per call and pauses between calls', async () => {
  const { keeper, calls, sleeps } = setup();
  const items = Array.from({ length: 100 }, (_, i) => ({ ref: `0x${i}`, owner: `0x${i}`, text: `tailor ${i}` }));
  const got = await keeper.backfill(items);
  assert.deepEqual(calls.map((c) => c.texts.length), [96, 4]);
  assert.ok(calls.every((c) => c.inputType === 'search_document'));
  assert.deepEqual(sleeps, [7]);
  assert.deepEqual(got, { made: 100, failed: 0 });
});

test('backfill skips sellers that already have a current vector', async () => {
  const { keeper, calls } = setup();
  await keeper.ensure(seller('0xa', 'tailor'));
  await keeper.backfill([{ ref: '0xa', owner: '0xa', text: 'tailor' }, { ref: '0xb', owner: '0xb', text: 'caterer' }]);
  assert.deepEqual(calls.map((c) => c.texts), [['tailor'], ['caterer']]);
});

test('backfill stops when the switch is turned off', async () => {
  const ctl = setup();
  const items = Array.from({ length: 200 }, (_, i) => ({ ref: `0x${i}`, owner: `0x${i}`, text: `t ${i}` }));
  const keeper = createMeaningKeeper({
    on: () => ctl.calls.length < 1,
    model: () => 'm@2',
    threshold: () => 0.4,
    embed: async (texts, inputType) => (ctl.calls.push({ texts, inputType }), texts.map(() => Float32Array.from([1, 0]))),
    store,
    now: () => 1,
    gapMs: 0,
    sleep: async () => undefined,
  });
  const got = await keeper.backfill(items);
  assert.equal(ctl.calls.length, 1);
  assert.equal(got.made, 96);
});

test('a failed batch is skipped, not retried at once', async () => {
  let calls = 0;
  const { keeper } = setup({ embed: async () => ((calls += 1), null) });
  const got = await keeper.backfill([{ ref: '0xa', owner: '0xa', text: 'tailor' }]);
  assert.equal(calls, 1);
  assert.deepEqual(got, { made: 0, failed: 1 });
});

test('a query gives up past its time limit', async () => {
  let limit: number | undefined;
  const { keeper } = setup({ embed: async (_t, _i, timeoutMs) => ((limit = timeoutMs), null) });
  assert.equal(await keeper.query('tailor', { timeoutMs: 1500 }), null);
  assert.equal(limit, 1500);
});

test('a query is embedded as a search query and remembered', async () => {
  const { keeper, calls } = setup();
  const a = await keeper.query('tailor near me', { timeoutMs: 100 });
  const b = await keeper.query('Tailor near me', { timeoutMs: 100 });
  assert.deepEqual([...a!], [1, 0]);
  assert.deepEqual([...b!], [1, 0]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.inputType, 'search_query');
});

test('a query saved for a request is reused and can be read back', async () => {
  const { keeper, calls } = setup();
  await keeper.query('tailor for my wedding', { timeoutMs: 100, save: { kind: 'request', ref: 'job-1', owner: '0xb' } });
  const again = createMeaningKeeper({ on: () => true, model: () => 'm@2', threshold: () => 0.4, embed: async () => { throw new Error('no call expected'); }, store, now: () => 1, gapMs: 0, sleep: async () => undefined });
  const v = await again.query('tailor for my wedding', { timeoutMs: 100, save: { kind: 'request', ref: 'job-1', owner: '0xb' } });
  assert.deepEqual([...v!], [1, 0]);
  assert.ok(again.vectorOf('request', 'job-1'));
  assert.equal(calls.length, 1);
});

test('the scorer ranks by meaning above the threshold', async () => {
  const { keeper } = setup();
  await keeper.ensure(seller('0xa', 'tailor'));
  await keeper.ensure(seller('0xb', 'caterer'));
  const score = keeper.scorer(Float32Array.from([1, 0]), 'seller')!;
  assert.equal(score('0xa'), 100);
  assert.equal(score('0xb'), 0);
  assert.equal(score('0xnobody'), 0);
  assert.equal(keeper.scorer(null, 'seller'), undefined);
});


test('counts name the model and how many sellers hold a current vector', async () => {
  const { keeper, switchOff } = setup();
  await keeper.ensure(seller('0xa', 'tailor'));
  await keeper.ensure(seller('0xb', 'caterer'));
  await keeper.query('tailor', { timeoutMs: 100, save: { kind: 'request', ref: 'job-1', owner: '0xc' } });
  assert.deepEqual(keeper.counts(), { model: 'm@2', sellers: 2 });
  switchOff();
  assert.deepEqual(keeper.counts(), { model: null, sellers: 0 });
});
