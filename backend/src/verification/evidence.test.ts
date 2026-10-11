import assert from 'node:assert/strict';
import test from 'node:test';
import { addFact, factsFor, sealedExtras, type EvidenceDeps, type StoredFact } from './evidence.js';

const now = Date.UTC(2026, 9, 12);
const YEAR = 365 * 24 * 3_600_000;

function deps(over: Partial<{ xUserId: string; settled: number }> = {}) {
  const store = new Map<string, StoredFact[]>();
  const d: EvidenceDeps = {
    getStored: async (a) => store.get(a) ?? [],
    putStored: async (a, facts) => {
      store.set(a, facts);
    },
    profile: async () => (over.xUserId ? { xUserId: over.xUserId } : null),
    settledDeals: async () => over.settled ?? 0,
  };
  return { d, store };
}

const fact = (over: Partial<StoredFact>): StoredFact => ({
  id: 'f1',
  kind: 'client_confirmation',
  level: 'user_proof',
  issuedAt: now,
  expiresAt: now + 2 * YEAR,
  evidenceHash: '0xaa',
  source: 'whatsapp',
  independent: true,
  ...over,
});

test('a linked X account is an owned account fact', async () => {
  const { d } = deps({ xUserId: '123' });
  const facts = await factsFor('0xada', d, now);
  assert.ok(facts.some((f) => f.kind === 'owned_account' && f.level === 'official_api'));
});

test('a settled Karwan deal is a deal fact', async () => {
  const { d } = deps({ settled: 2 });
  assert.ok((await factsFor('0xada', d, now)).some((f) => f.kind === 'karwan_deal'));
});

test('no evidence gives no facts', async () => {
  const { d } = deps();
  assert.deepEqual(await factsFor('0xada', d, now), []);
});

test('a fact is stored once per piece of evidence', async () => {
  const { d, store } = deps();
  assert.equal(await addFact('0xada', fact({ id: 'a' }), d), true);
  assert.equal(await addFact('0xada', fact({ id: 'b' }), d), false);
  assert.equal(store.get('0xada')?.length, 1);
  assert.equal(await addFact('0xada', fact({ id: 'c', evidenceHash: '0xbb' }), d), true);
});

test('addresses are stored lowercased', async () => {
  const { d, store } = deps();
  await addFact('0xADA', fact({}), d);
  assert.ok(store.has('0xada'));
});

test('sealed extras reflect valid facts only', () => {
  const extras = sealedExtras(
    [
      fact({ kind: 'client_confirmation', independent: true }),
      fact({ kind: 'cac_match', level: 'official_record', expiresAt: now - 1 }),
      fact({ kind: 'person_check', level: 'person' }),
    ],
    now,
  );
  assert.deepEqual(extras, { clientConfirmed: true, registeredBusiness: false, githubWork: false, personVerified: true });
});

test('a confirmation from an unverified client is not shown as confirmed', () => {
  assert.equal(sealedExtras([fact({ independent: false })], now).clientConfirmed, false);
});

test('a revoked fact stops counting, and the same evidence can back the account again later', async () => {
  const { revokeFact } = await import('./evidence.js');
  const { d } = deps();
  await addFact('0xada', fact({ id: 'cac-1', kind: 'cac_match', level: 'human_reviewed', evidenceHash: '0xcc' }), d);
  assert.equal(await revokeFact('0xada', 'cac-1', now, d), true);
  assert.equal((await factsFor('0xada', d, now)).some((f) => f.kind === 'cac_match'), false);
  assert.equal(await revokeFact('0xada', 'cac-1', now, d), false, 'already revoked');
  assert.equal(await revokeFact('0xada', 'nope', now, d), false);
  assert.equal(await addFact('0xada', fact({ id: 'cac-2', kind: 'cac_match', level: 'human_reviewed', evidenceHash: '0xcc' }), d), true);
  assert.equal((await factsFor('0xada', d, now)).filter((f) => f.kind === 'cac_match').length, 1);
});

test('the fingerprint that leaves Karwan is keyed: a guess cannot be tested against it', async () => {
  const { createHash, createHmac } = await import('node:crypto');
  const { evidenceHashOf, sealEvidence } = await import('./evidence.js');
  const key = 'k'.repeat(32);
  const plain = evidenceHashOf('cac_match', 'RC1234567', 'ada builds');
  const sealed = sealEvidence(plain, key);
  assert.match(sealed, /^0x[0-9a-f]{64}$/);
  assert.notEqual(sealed, plain);
  assert.equal(sealed, sealEvidence(plain.toUpperCase().replace('0X', '0x'), key), 'the same evidence gives the same fingerprint');
  assert.notEqual(sealed, sealEvidence(plain, 'j'.repeat(32)), 'a different key gives a different fingerprint');
  assert.equal(sealed, `0x${createHmac('sha256', key).update(plain).digest('hex')}`);
  const guess = `0x${createHash('sha256').update('cac_match|RC1234567|ada builds').digest('hex')}`;
  assert.equal(guess, plain, 'the stored fingerprint alone can be recomputed from a guess');
  assert.notEqual(guess, sealed, 'the published one cannot');
});
