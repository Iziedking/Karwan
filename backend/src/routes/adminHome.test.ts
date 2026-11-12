import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// Home on the desk (view 79): any signed-in teammate reads it, filtered to
/// their own pages inside.
///
///   npx tsx --test src/routes/adminHome.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');

const MEMBERS = join(tmpdir(), `karwan-home-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-home-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'home-test-secret';
delete process.env.ADMIN_API_TOKEN;
delete process.env.SUPPORT_API_TOKEN;

const { Hono } = await import('hono');
const { adminDeskRoutes } = await import('./adminDesk.js');
const { adminHomeRoutes, useHomeFactsForTests } = await import('./adminHome.js');
const { useAdminDeskStoreForTests } = await import('../middleware/adminAuth.js');
const { memoryAdminDeskStore } = await import('../db/adminDesk.js');
const { createInvite, redeemInvite, setDeskOwner } = await import('../db/teamMembers.js');

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

useAdminDeskStoreForTests(memoryAdminDeskStore());
const app = new Hono();
app.route('/api/admin', adminDeskRoutes);
app.route('/api/admin', adminHomeRoutes);

const PASSWORD = 'correct horse battery staple';
let ip = 0;
async function call(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.7.0.${++ip}` };
  if (token) headers['x-admin-token'] = token;
  return app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function member(email: string, name: string) {
  const { rawToken } = await createInvite({ email, name, role: 'dev' });
  const r = await redeemInvite(rawToken, PASSWORD);
  assert.ok(r.ok);
  return r.member;
}
const tokenOf = async (email: string) => ((await (await call('POST', '/api/admin/session', undefined, { email, password: PASSWORD })).json()) as { token: string }).token;

await member('owner@karwan.site', 'Owner');
await setDeskOwner('owner@karwan.site');
const ownerToken = await tokenOf('owner@karwan.site');
const sam = await member('sam@karwan.site', 'Sam');
await call('PUT', `/api/admin/access/${sam.id}`, ownerToken, { access: { support: 'change' } });

const NOW = Date.now();
useHomeFactsForTests(async () => ({
  requests: [],
  cases: [{ ref: 'KS-2001', kind: 'account', state: 'open', dueAt: NOW - 60_000, createdAt: NOW - 3 * 3_600_000 }],
  deals: [{ jobId: '0xd1', buyer: '0xb', seller: '0xs', amountUsdc: '10', stage: 'disputed', createdAt: NOW - 3_600_000 }],
  accounts: [],
  system: [{ label: 'Website and app', state: 'working' }],
  rows: [],
  members: [],
}));

test('a support teammate reads Home with only what their pages open', async () => {
  const r = await call('GET', '/api/admin/home', await tokenOf('sam@karwan.site'));
  assert.equal(r.status, 200);
  const view = (await r.json()) as { needsYou: Array<{ kind: string }>; today: Array<{ key: string }>; system: unknown };
  assert.deepEqual(view.needsYou.map((n) => n.kind), ['late_case']);
  assert.deepEqual(view.today.map((t) => t.key), ['support']);
  assert.equal(view.system, null);
});

test('the owner reads everything, disputes and System included', async () => {
  const view = (await (await call('GET', '/api/admin/home', ownerToken)).json()) as { needsYou: Array<{ kind: string }>; system: unknown };
  assert.deepEqual(view.needsYou.map((n) => n.kind), ['dispute', 'late_case']);
  assert.deepEqual(view.system, [{ label: 'Website and app', state: 'working' }]);
});

test('Home needs a signed-in teammate', async () => {
  assert.equal((await call('GET', '/api/admin/home')).status, 401);
});
