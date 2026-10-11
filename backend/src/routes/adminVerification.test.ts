import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ADMIN_API_TOKEN ??= 'admin-verification-test-token-at-least-32-chars';
const { adminVerificationRoutes } = await import('./adminVerification.js');
const { installVerificationServices } = await import('../verification/services.js');
const { createCacReview } = await import('../verification/cac.js');
type CacRequest = import('../verification/cac.js').CacRequest;

const headers = { 'content-type': 'application/json', 'x-admin-token': process.env.ADMIN_API_TOKEN! };

function install() {
  const records = new Map<string, CacRequest>();
  const holders = new Map<string, string>();
  let n = 0;
  const cac = createCacReview({
    now: () => Date.UTC(2026, 9, 12),
    newId: () => `cac${++n}`,
    get: async (id) => records.get(id) ?? null,
    put: async (r) => {
      records.set(r.id, r);
    },
    list: async () => [...records.values()],
    addFact: async () => true,
    tell: async () => {},
    holderOf: async (rc) => holders.get(rc) ?? null,
    claim: async (rc, address) => {
      if (holders.has(rc) && holders.get(rc) !== address) return false;
      holders.set(rc, address);
      return true;
    },
    release: async (rc, address) => {
      if (holders.get(rc) === address) holders.delete(rc);
    },
    revokeFact: async () => true,
  });
  installVerificationServices({ cac, clientConfirm: {} as never, sendsToNumbers: false });
  return { cac, records };
}

const post = (path: string, body: unknown) =>
  adminVerificationRoutes.request(path, { method: 'POST', headers, body: JSON.stringify(body) });

test('a second account cannot be approved for a number another account holds', async () => {
  const { cac } = install();
  await cac.submit('0xada', 'RC1234567', 'Ada Builds');
  await cac.submit('0xkemi', 'RC1234567', 'Ada Builds');
  assert.equal((await post('/cac/cac1', { approved: true, reviewer: 'r' })).status, 200);
  const second = await post('/cac/cac2', { approved: true, reviewer: 'r' });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).code, 'RC_IN_USE');
});

test('a reviewer lists approvals and undoes one with a reason', async () => {
  const { cac, records } = install();
  await cac.submit('0xada', 'RC7654321', 'Ada Builds');
  await post('/cac/cac1', { approved: true, reviewer: 'r' });
  const listed = await adminVerificationRoutes.request('/cac/approved', { headers });
  assert.deepEqual((await listed.json()).approved.map((r: CacRequest) => r.id), ['cac1']);

  assert.equal((await post('/cac/cac1/revoke', { reviewer: 'r' })).status, 400, 'a reason is required');
  const undone = await post('/cac/cac1/revoke', { reviewer: 'r', reason: 'The registry lists a different owner.' });
  assert.equal(undone.status, 200);
  assert.equal(records.get('cac1')?.status, 'revoked');
  assert.equal((await post('/cac/cac1/revoke', { reviewer: 'r', reason: 'Again, twice.' })).status, 409);
});

test('the queue is admin only', async () => {
  install();
  const res = await adminVerificationRoutes.request('/cac/approved');
  assert.equal(res.status, 401);
});
