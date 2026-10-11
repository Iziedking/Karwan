import assert from 'node:assert/strict';
import test from 'node:test';
import { createCacReview, normalizeRc, type CacDeps, type CacRequest } from './cac.js';
import type { StoredFact } from './evidence.js';

const now = Date.UTC(2026, 9, 12);

function setup() {
  const records = new Map<string, CacRequest>();
  const facts: Array<{ address: string; fact: StoredFact }> = [];
  const told: string[] = [];
  const holders = new Map<string, string>();
  const revoked: string[] = [];
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
    holderOf: async (rc) => holders.get(rc) ?? null,
    claim: async (rc, address) => {
      const held = holders.get(rc);
      if (held && held !== address) return false;
      holders.set(rc, address);
      return true;
    },
    release: async (rc, address) => {
      if (holders.get(rc) === address) holders.delete(rc);
    },
    revokeFact: async (address, factId) => {
      revoked.push(`${address}:${factId}`);
      return true;
    },
  };
  return { cac: createCacReview(deps), records, facts, told, holders, revoked };
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
  assert.equal(await cac.decide('cac1', true, 'reviewer@karwan'), 'decided');
  assert.equal(facts[0].address, '0xada');
  assert.equal(facts[0].fact.kind, 'cac_match');
  assert.equal(facts[0].fact.level, 'human_reviewed');
  assert.match(told[0], /registered business/i);
});

test('a rejection writes no fact, tells the person, and cannot be decided again', async () => {
  const { cac, facts, told } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  assert.equal(await cac.decide('cac1', false, 'reviewer@karwan'), 'decided');
  assert.equal(facts.length, 0);
  assert.match(told[0], /could not match/i);
  assert.equal(await cac.decide('cac1', true, 'reviewer@karwan'), 'unknown');
});

test('pending lists only what still needs a decision', async () => {
  const { cac } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  await cac.submit('0xkemi', 'BN7654321', 'Kemi Designs');
  await cac.decide('cac1', true, 'r');
  assert.deepEqual((await cac.pending()).map((r) => r.id), ['cac2']);
});

test('one registration number backs one account: a second account is refused at submit', async () => {
  const { cac, records } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  await cac.decide('cac1', true, 'r');
  assert.deepEqual(await cac.submit('0xkemi', 'rc 1234567', 'Ada Builds'), { ok: false, reason: 'in_use' });
  assert.equal(records.size, 1);
  assert.equal((await cac.submit('0xada', 'RC1234567', 'Ada Builds')).ok, true, 'the holder can submit its own number again');
});

test('two accounts waiting on one number: only the first approval holds, the second is refused and told', async () => {
  const { cac, records, facts, told } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  await cac.submit('0xkemi', 'RC1234567', 'Ada Builds');
  assert.equal(await cac.decide('cac1', true, 'r'), 'decided');
  assert.equal(await cac.decide('cac2', true, 'r'), 'in_use');
  assert.equal(records.get('cac2')?.status, 'rejected');
  assert.equal(facts.length, 1);
  assert.match(told.at(-1)!, /already backs another Karwan account/);
});

test('a reviewer can undo an approval: the fact stops counting and the number is free again', async () => {
  const { cac, records, revoked, holders, told } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  await cac.decide('cac1', true, 'r');
  assert.equal(await cac.revoke('cac1', 'reviewer@karwan', 'The registry lists a different owner.'), true);
  const r = records.get('cac1')!;
  assert.equal(r.status, 'revoked');
  assert.equal(r.revokeReason, 'The registry lists a different owner.');
  assert.equal(r.revokedBy, 'reviewer@karwan');
  assert.deepEqual(revoked, ['0xada:cac-cac1']);
  assert.equal(holders.has('RC1234567'), false);
  assert.match(told.at(-1)!, /no longer on your record/);
  assert.equal(await cac.revoke('cac1', 'r', 'again'), false, 'a revoked approval cannot be revoked twice');
  assert.equal((await cac.submit('0xkemi', 'RC1234567', 'Kemi Builds')).ok, true);
});

test('only an approval can be undone', async () => {
  const { cac } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  assert.equal(await cac.revoke('cac1', 'r', 'x'), false);
  assert.equal(await cac.revoke('nope', 'r', 'x'), false);
});

test('decided requests can be listed for a reviewer looking for one to undo', async () => {
  const { cac } = setup();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  await cac.decide('cac1', true, 'r');
  assert.deepEqual((await cac.approved()).map((r) => r.id), ['cac1']);
});
