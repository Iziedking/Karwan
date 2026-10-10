import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoredFact } from '../verification/evidence.js';
import { createPersonVerificationRoutes, type PersonVerificationDeps } from './personVerification.js';

const now = Date.UTC(2026, 9, 12);

function setup(
  opts: {
    session?: string | null;
    worldId?: Awaited<ReturnType<PersonVerificationDeps['verifyWorldId']>>;
    claimOk?: boolean;
  } = {},
) {
  const facts: Array<{ address: string; fact: StoredFact }> = [];
  const cacSubmitted: string[] = [];
  const deps: PersonVerificationDeps = {
    now: () => now,
    sessionAddress: () => (opts.session === undefined ? '0xada' : opts.session),
    verifyWorldId: async () => opts.worldId ?? { verified: true, nullifiers: ['n1'] },
    claimNullifier: async () => opts.claimOk ?? true,
    addFact: async (address, fact) => {
      facts.push({ address, fact });
      return true;
    },
    levelOf: async () => 'person_verified',
    submitCac: async (address, rc) => {
      cacSubmitted.push(`${address}:${rc}`);
      return rc === 'bad' ? { ok: false, reason: 'invalid_number' } : { ok: true, status: 'review', id: 'cac1' };
    },
  };
  return { app: createPersonVerificationRoutes(deps), facts, cacSubmitted };
}

const post = (app: ReturnType<typeof setup>['app'], path: string, body: unknown) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('the person check needs a signed-in account', async () => {
  const { app, facts } = setup({ session: null });
  const res = await post(app, '/person', { idkitResponse: {} });
  assert.equal(res.status, 401);
  assert.equal(facts.length, 0);
});

test('a valid World ID proof writes a person check fact to the signed-in account', async () => {
  const { app, facts } = setup();
  const res = await post(app, '/person', { idkitResponse: { any: 1 } });
  assert.equal(res.status, 200);
  assert.equal(facts[0].address, '0xada');
  assert.equal(facts[0].fact.kind, 'person_check');
  assert.equal(facts[0].fact.level, 'person');
  assert.deepEqual(await res.json(), { verified: true, level: 'person_verified' });
});

test('a rejected proof writes nothing and says why', async () => {
  const { app, facts } = setup({ worldId: { verified: false, code: 'WORLD_ID_PROOF_REJECTED', error: 'rejected' } });
  const res = await post(app, '/person', { idkitResponse: {} });
  assert.equal(res.status, 403);
  assert.equal(facts.length, 0);
});

test('a World ID already tied to another account is refused', async () => {
  const { app, facts } = setup({ claimOk: false });
  const res = await post(app, '/person', { idkitResponse: {} });
  assert.equal(res.status, 409);
  assert.equal(facts.length, 0);
});

test('my verification returns the level only to the signed-in owner', async () => {
  assert.equal((await setup({ session: null }).app.request('/me')).status, 401);
  const res = await setup().app.request('/me');
  assert.deepEqual(await res.json(), { level: 'person_verified' });
});

test('a CAC number is queued for review for the signed-in account', async () => {
  const { app, cacSubmitted } = setup();
  const res = await post(app, '/cac', { rc: 'RC1234567', name: 'Ada Builds Ltd' });
  assert.equal(res.status, 200);
  assert.deepEqual(cacSubmitted, ['0xada:RC1234567']);
  const bad = await post(app, '/cac', { rc: 'bad', name: 'x' });
  assert.equal(bad.status, 400);
});
