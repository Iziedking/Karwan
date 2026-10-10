import assert from 'node:assert/strict';
import test from 'node:test';
import { createCacReview, normalizeRc, type CacDeps, type CacRequest } from './cac.js';
import type { StoredFact } from './evidence.js';

const now = Date.UTC(2026, 9, 12);

function setup() {
  const records = new Map<string, CacRequest>();
  const facts: Array<{ address: string; fact: StoredFact }> = [];
  const told: string[] = [];
  const deps: CacDeps = {
    now: () => now,
    newId: () => `cac${records.size + 1}`,
    get: async (id) => records.get(id) ?? null,
    put: async (r) => {
      records.set(r.id, r);
    },
    list: async () => [...records.values()],
    addFact: async (address, fact) => {
      facts.push({ address, fact });
      return true;
    },
    tell: async (_address, text) => {
      told.push(text);
    },
  };
  return { cac: createCacReview(deps), records, facts, told };
}

test('RC and BN numbers are normalised; anything else is refused', () => {
  assert.equal(normalizeRc(' rc 1234567 '), 'RC1234567');
  assert.equal(normalizeRc('BN-3344556'), 'BN3344556');
  assert.equal(normalizeRc('1234567'), 'RC1234567');
  assert.equal(normalizeRc('hello'), null);
});

test('a submitted number waits for a reviewer', async () => {
  const { cac, records } = setup();
  const r = await cac.submit('0xADA', 'RC 1234567', 'Ada Builds Ltd');
  assert.deepEqual(r, { ok: true, status: 'review', id: 'cac1' });
  assert.equal(records.get('cac1')?.address, '0xada');
});

test('an invalid number is refused without queueing', async () => {
  const { cac, records } = setup();
  assert.deepEqual(await cac.submit('0xada', 'abc', 'Ada'), { ok: false, reason: 'invalid_number' });
  assert.equal(records.size, 0);
});

test('the same number pending for the same account is not queued twice', async () => {
  const { cac, records } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  await cac.submit('0xada', 'rc 1234567', 'Ada Builds');
  assert.equal(records.size, 1);
});

test('a reviewer approval writes a human-reviewed CAC fact and tells the person', async () => {
  const { cac, facts, told } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  assert.equal(await cac.decide('cac1', true, 'reviewer@karwan'), true);
  assert.equal(facts[0].address, '0xada');
  assert.equal(facts[0].fact.kind, 'cac_match');
  assert.equal(facts[0].fact.level, 'human_reviewed');
  assert.match(told[0], /registered business/i);
});

test('a rejection writes no fact, tells the person, and cannot be decided again', async () => {
  const { cac, facts, told } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  assert.equal(await cac.decide('cac1', false, 'reviewer@karwan'), true);
  assert.equal(facts.length, 0);
  assert.match(told[0], /could not match/i);
  assert.equal(await cac.decide('cac1', true, 'reviewer@karwan'), false);
});

test('pending lists only what still needs a decision', async () => {
  const { cac } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  await cac.submit('0xkemi', 'BN7654321', 'Kemi Designs');
  await cac.decide('cac1', true, 'r');
  assert.deepEqual((await cac.pending()).map((r) => r.id), ['cac2']);
});
