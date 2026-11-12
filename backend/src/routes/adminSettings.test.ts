import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// Settings on the desk (view 79): switches read on or off, never a value;
/// turning deal rules off needs a second teammate, turning them on does not.
///
///   npx tsx --test src/routes/adminSettings.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');

const MEMBERS = join(tmpdir(), `karwan-settings-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-settings-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'settings-test-secret';
delete process.env.ADMIN_API_TOKEN;
delete process.env.SUPPORT_API_TOKEN;

const { Hono } = await import('hono');
const { adminDeskRoutes } = await import('./adminDesk.js');
const { adminRequestRoutes } = await import('./adminRequests.js');
const { adminSettingsRoutes, useSettingsForTests } = await import('./adminSettings.js');
const { useAdminDeskStoreForTests } = await import('../middleware/adminAuth.js');
const { setDeskReplay, useTwoPeopleForTests } = await import('../middleware/twoPeople.js');
const { memoryAdminDeskStore } = await import('../db/adminDesk.js');
const { memoryAdminRequestStore } = await import('../db/adminRequests.js');
const { createInvite, redeemInvite, setDeskOwner } = await import('../db/teamMembers.js');

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

useAdminDeskStoreForTests(memoryAdminDeskStore());
useTwoPeopleForTests({ store: memoryAdminRequestStore(), now: () => Date.now() });
const app = new Hono();
app.route('/api/admin', adminDeskRoutes);
app.route('/api/admin', adminRequestRoutes);
app.route('/api/admin', adminSettingsRoutes);
setDeskReplay((req) => Promise.resolve(app.fetch(req)));

let dealRules = true;
const SECRET = '0xabc123secretkey';
useSettingsForTests({
  dealRules: async () => ({ on: dealRules }),
  setDealRules: async (on) => {
    dealRules = on;
    return { on };
  },
  formLimits: async () => ({ on: false }),
  env: { AGENT_SEED_PRIVATE_KEY: SECRET, X402_PAID_SIGNALS_ENABLED: true, X402_BASE_PRIVATE_KEY: undefined, KARWAN_TREASURY_USYC_ADDR: '0x1', USYC_OPERATOR_PRIVATE_KEY: SECRET, VERIFIED_REPUTATION_ENFORCED: false, BUSINESS_AUTO_APPROVE: true },
});

const PASSWORD = 'correct horse battery staple';
let ip = 0;
async function call(method: string, path: string, token?: string, opts: { body?: unknown; reason?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.11.0.${++ip}` };
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
const owner = await tokenOf('owner@karwan.site');
const dev = await member('dev@karwan.site', 'Dev');
await call('PUT', `/api/admin/access/${dev.id}`, owner, { body: { access: { diagnostics: 'fix' } } });
const devToken = await tokenOf('dev@karwan.site');

test('settings answer each switch on or off and never a value', async () => {
  const r = await call('GET', '/api/admin/settings', owner);
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.ok(!text.includes(SECRET));
  const body = JSON.parse(text) as { switches: Array<{ key: string; on: boolean; secondPerson: boolean }>; server: Array<{ name: string; on: boolean }> };
  assert.deepEqual(body.switches, [
    { key: 'deal_rules', on: true, secondPerson: true },
    { key: 'form_limits', on: false, secondPerson: false },
  ]);
  assert.deepEqual(body.server, [
    { name: 'Agent gas seed', on: true },
    { name: 'Paid signals', on: true },
    { name: 'Outside research', on: false },
    { name: 'Treasury yield', on: true },
    { name: 'Reputation check', on: false },
    { name: 'Approve businesses automatically', on: true },
  ]);
});

test('settings are the owner\'s alone', async () => {
  assert.equal((await call('GET', '/api/admin/settings', devToken)).status, 403);
});

test('turning deal rules off opens a request and changes nothing until a second teammate approves', async () => {
  const asked = await call('POST', '/api/admin/deal-rules/off', devToken, { body: {}, reason: 'Arc is down for an hour' });
  assert.equal(asked.status, 202);
  assert.equal(dealRules, true);
  const id = ((await asked.json()) as { request: { id: string } }).request.id;
  assert.equal((await call('POST', `/api/admin/requests/${id}/approve`, devToken)).status, 403);
  assert.equal((await call('POST', `/api/admin/requests/${id}/approve`, owner)).status, 200);
  assert.equal(dealRules, false);
});

test('turning deal rules on is one person, at once; the old body cannot turn them off', async () => {
  assert.equal((await call('POST', '/api/admin/deal-rules', devToken, { body: { on: true } })).status, 200);
  assert.equal(dealRules, true);
  assert.equal((await call('POST', '/api/admin/deal-rules', devToken, { body: { on: false } })).status, 400);
  assert.equal(dealRules, true);
});
