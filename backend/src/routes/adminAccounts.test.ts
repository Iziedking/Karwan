import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// Accounts on the desk (view 79): read with the Accounts page, pause with
/// change, and a pause lifted only when a second teammate approves.
///
///   npx tsx --test src/routes/adminAccounts.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');

const MEMBERS = join(tmpdir(), `karwan-accounts-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-accounts-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'accounts-test-secret';
delete process.env.ADMIN_API_TOKEN;
delete process.env.SUPPORT_API_TOKEN;

const { Hono } = await import('hono');
const { adminDeskRoutes } = await import('./adminDesk.js');
const { adminRequestRoutes } = await import('./adminRequests.js');
const { adminAccountsRoutes, useAccountsForTests } = await import('./adminAccounts.js');
const { useAdminDeskStoreForTests } = await import('../middleware/adminAuth.js');
const { setDeskReplay, useTwoPeopleForTests } = await import('../middleware/twoPeople.js');
const { memoryAdminDeskStore } = await import('../db/adminDesk.js');
const { memoryAdminRequestStore } = await import('../db/adminRequests.js');
const { createMemoryMoneyOutStore } = await import('../moneyOut/store.js');
const { createInvite, redeemInvite, setDeskOwner } = await import('../db/teamMembers.js');

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

useAdminDeskStoreForTests(memoryAdminDeskStore());
useTwoPeopleForTests({ store: memoryAdminRequestStore(), now: () => Date.now() });
const app = new Hono();
app.route('/api/admin', adminDeskRoutes);
app.route('/api/admin', adminRequestRoutes);
app.route('/api/admin', adminAccountsRoutes);
setDeskReplay((req) => Promise.resolve(app.fetch(req)));

const NOW = Date.now();
const CHIDI = '0x00000000000000000000000000000000000c41de';
const moneyOut = createMemoryMoneyOutStore();
useAccountsForTests({
  profiles: async () => [
    { address: CHIDI, displayName: 'Chidi Okafor', handle: 'chidi', createdAt: NOW - 1000, settings: { setupDoneAt: NOW - 900 }, email: 'chidi@private.example' },
  ] as never,
  deals: async () => [],
  openMoves: async () => [],
  movesFor: async () => [],
  casesFor: async () => [],
  signIn: () => 'email',
  telegramLinked: async () => false,
  balance: async () => ({ totalUsdc: 8.08, agentsUsdc: 0 }),
  moneyOut,
});

const PASSWORD = 'correct horse battery staple';
let ip = 0;
async function call(method: string, path: string, token?: string, opts: { body?: unknown; reason?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${++ip}` };
  if (token) headers['x-admin-token'] = token;
  if (opts.reason) headers['x-desk-reason'] = opts.reason;
  return app.request(path, { method, headers, ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }) });
}
async function member(email: string, name: string) {
  const { rawToken } = await createInvite({ email, name, role: 'dev' });
  const r = await redeemInvite(rawToken, PASSWORD);
  assert.ok(r.ok);
  return r.member;
}
const tokenOf = async (email: string) => ((await (await call('POST', '/api/admin/session', undefined, { body: { email, password: PASSWORD } })).json()) as { token: string }).token;

await member('owner@karwan.site', 'Owner');
await setDeskOwner('owner@karwan.site');
const ownerToken = await tokenOf('owner@karwan.site');
const reader = await member('rea@karwan.site', 'Rea');
const tobi = await member('tobi@karwan.site', 'Tobi Martins');
const kemi = await member('kemi@karwan.site', 'Kemi Eze');
await call('PUT', `/api/admin/access/${reader.id}`, ownerToken, { body: { access: { profiles: 'read' } } });
await call('PUT', `/api/admin/access/${tobi.id}`, ownerToken, { body: { access: { profiles: 'fix' } } });
await call('PUT', `/api/admin/access/${kemi.id}`, ownerToken, { body: { access: { profiles: 'fix' } } });
const rea = await tokenOf('rea@karwan.site');
const tobiToken = await tokenOf('tobi@karwan.site');
const kemiToken = await tokenOf('kemi@karwan.site');

test('a teammate with Accounts reads the list and one account, never the email', async () => {
  const list = await call('GET', '/api/admin/accounts', rea);
  assert.equal(list.status, 200);
  const body = (await list.json()) as { accounts: Array<{ address: string; status: string }> };
  assert.deepEqual(body.accounts.map((a) => [a.address, a.status]), [[CHIDI, 'active']]);
  const one = await call('GET', `/api/admin/accounts/${CHIDI}`, rea);
  assert.equal(one.status, 200);
  const text = await one.text();
  assert.ok(!text.includes('chidi@private.example'));
  assert.equal((JSON.parse(text) as { money: { balanceUsdc: string } }).money.balanceUsdc, '8.08');
  assert.equal((await call('GET', '/api/admin/accounts/0x0000000000000000000000000000000000000bad', rea)).status, 404);
});

test('a teammate finds an account by the email a person wrote from, and the answer never carries it', async () => {
  const found = await call('GET', '/api/admin/accounts?email=CHIDI@private.example', rea);
  assert.equal(found.status, 200);
  const text = await found.text();
  assert.ok(!text.includes('chidi@private.example'));
  assert.deepEqual((JSON.parse(text) as { accounts: Array<{ address: string }> }).accounts.map((a) => a.address), [CHIDI]);
  const none = (await (await call('GET', '/api/admin/accounts?email=nobody@example.com', rea)).json()) as { accounts: unknown[] };
  assert.equal(none.accounts.length, 0);
});

test('read alone cannot pause; change pauses at once and says who', async () => {
  assert.equal((await call('POST', `/api/admin/accounts/${CHIDI}/pause`, rea)).status, 403);
  assert.equal((await call('POST', `/api/admin/accounts/${CHIDI}/pause`, tobiToken)).status, 200);
  assert.notEqual((await moneyOut.state(CHIDI)).pausedAt, null);
  const one = (await (await call('GET', `/api/admin/accounts/${CHIDI}`, rea)).json()) as { status: string; paused: { by: string } | null };
  assert.equal(one.status, 'paused');
  assert.equal(one.paused?.by, 'Tobi Martins');
});

test('lifting a desk pause opens a request and does nothing until a second teammate approves', async () => {
  const asked = await call('POST', `/api/admin/accounts/${CHIDI}/unpause`, tobiToken, { body: {}, reason: 'KS-1042: phone found' });
  assert.equal(asked.status, 202);
  assert.notEqual((await moneyOut.state(CHIDI)).pausedAt, null, 'still paused');
  const id = ((await asked.json()) as { request: { id: string } }).request.id;
  assert.equal((await call('POST', `/api/admin/requests/${id}/approve`, tobiToken)).status, 403);
  assert.equal((await call('POST', `/api/admin/requests/${id}/approve`, kemiToken)).status, 200);
  assert.equal((await moneyOut.state(CHIDI)).pausedAt, null);
});

test('the person\'s own unpause clears a desk pause: one pause, one field', async () => {
  await call('POST', `/api/admin/accounts/${CHIDI}/pause`, tobiToken);
  await moneyOut.setPaused(CHIDI, null);
  const one = (await (await call('GET', `/api/admin/accounts/${CHIDI}`, rea)).json()) as { status: string };
  assert.equal(one.status, 'active');
});
