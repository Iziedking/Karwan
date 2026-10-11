import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ADMIN_API_TOKEN ??= 'admin-deletion-test-token-at-least-32-chars-long';
const { createAdminAccountDeletionRoutes } = await import('./adminAccountDeletion.js');
const { createAccountDeletion } = await import('../accountDeletion/service.js');
const { createMemoryDeletionStore } = await import('../accountDeletion/store.js');

const ALICE = `0x${'a'.repeat(40)}`;
const headers = { 'content-type': 'application/json', 'x-admin-token': process.env.ADMIN_API_TOKEN! };

function app() {
  const told: string[] = [];
  const nothing = async () => {};
  const service = createAccountDeletion({
    now: () => Date.UTC(2026, 9, 12),
    newId: () => 'del-1',
    store: createMemoryDeletionStore(),
    chatAccount: async (a) => (a === ALICE ? { channel: 'telegram' } : null),
    standing: async () => ({ openDeals: 0, liveOffers: 0, openRequests: 0, activeBids: 0, holdings: [] }),
    tell: async (_a, m) => {
      told.push('body' in m ? m.body : '');
    },
    erase: {
      walletIds: async () => [],
      revokeFacts: nothing,
      factsSettled: async () => true,
      dropFacts: nothing,
      stores: [],
      dropChatAccount: nothing,
      releaseNullifiers: nothing,
    },
  });
  const routes = createAdminAccountDeletionRoutes(() => service);
  const call = (method: string, path: string, body?: unknown, h: Record<string, string> = headers) =>
    routes.request(path, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { call, told };
}

test('the deletion routes need the admin token', async () => {
  const { call } = app();
  assert.equal((await call('GET', '/', undefined, { 'content-type': 'application/json' })).status, 401);
});

test('a reviewer requests a deletion; it waits and the person is told in chat', async () => {
  const { call, told } = app();
  const r = await call('POST', '/', { address: ALICE, reviewer: 'ops' });
  assert.equal(r.status, 200);
  const body = (await r.json()) as { deletion: { state: string; requestedVia: string } };
  assert.equal(body.deletion.state, 'scheduled');
  assert.equal(body.deletion.requestedVia, 'admin');
  assert.match(told.at(-1)!, /request to delete your account/);
  assert.equal((await call('POST', '/', { address: ALICE, reviewer: 'ops' })).status, 409, 'one at a time');
  assert.equal((await call('POST', '/', { address: `0x${'c'.repeat(40)}`, reviewer: 'ops' })).status, 409, 'chat accounts only');
  assert.equal((await call('POST', '/', { address: 'not-an-address', reviewer: 'ops' })).status, 400);
  const list = (await (await call('GET', '/')).json()) as { deletions: unknown[] };
  assert.equal(list.deletions.length, 1);
});

test('a reviewer stops a waiting deletion with a reason the person sees', async () => {
  const { call, told } = app();
  await call('POST', '/', { address: ALICE, reviewer: 'ops' });
  assert.equal((await call('POST', '/del-1/refuse', { reviewer: 'ops', reason: 'no' })).status, 400, 'a reason is required');
  assert.equal((await call('POST', '/del-1/refuse', { reviewer: 'ops', reason: 'A dispute is still open.' })).status, 200);
  assert.match(told.at(-1)!, /A dispute is still open/);
  assert.equal((await call('POST', '/del-1/refuse', { reviewer: 'ops', reason: 'A dispute is still open.' })).status, 409);
});
