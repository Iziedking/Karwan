import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecordRoutes, type RecordDeps } from './record.js';

const now = Date.UTC(2026, 9, 12);

function setup(over: Partial<RecordDeps> = {}) {
  const deps: RecordDeps = {
    now: () => now,
    addressOfTag: async (tag) => (tag === 'ada' ? '0xada' : null),
    passport: async () => ({ displayName: 'Ada Builds', tag: 'ada', tier: 'Established', reasons: ['WORK_CONFIRMED_BY_CLIENT'] }),
    level: async () => 'work_verified',
    facts: async () => [
      { kind: 'client_confirmation', level: 'user_proof', issuedAt: now - 1, expiresAt: now + 1e9, evidenceHash: '0xaa', txHash: '0x01' },
      { kind: 'person_check', level: 'person', issuedAt: now - 1, expiresAt: now - 1, evidenceHash: '0xbb' },
    ],
    credential: async () => ({ type: 'karwan.record.v1', signed: true }),
    ...over,
  };
  return createRecordRoutes(deps);
}

test('a record shows name, level, tier, reasons and the valid facts with their proof', async () => {
  const res = await setup().request('/ada');
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.level, 'work_verified');
  assert.equal(body.tier, 'Established');
  assert.deepEqual(body.reasons, ['WORK_CONFIRMED_BY_CLIENT']);
  assert.deepEqual(body.facts, [{ kind: 'client_confirmation', issuedAt: now - 1, expiresAt: now + 1e9, txHash: '0x01' }]);
});

test('a record never carries numbers, phone, evidence or documents', async () => {
  const body = JSON.stringify(await (await setup().request('/ada')).json());
  for (const forbidden of ['evidenceHash', 'score', 'phone', 'number', 'volume', 'amount']) {
    assert.ok(!body.includes(`"${forbidden}"`), forbidden);
  }
});

test('an unknown tag is 404', async () => {
  assert.equal((await setup().request('/nobody')).status, 404);
});

test('the credential is served for a known tag and 503 when signing is off', async () => {
  const ok = await setup().request('/ada/credential');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { type: 'karwan.record.v1', signed: true });
  const off = await setup({ credential: async () => null }).request('/ada/credential');
  assert.equal(off.status, 503);
});

test('tags are matched without the @ and case', async () => {
  assert.equal((await setup().request('/@ADA')).status, 200);
});
