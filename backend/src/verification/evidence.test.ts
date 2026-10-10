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
