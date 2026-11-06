import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// Two people for any money move (view 64).
///
///   npx tsx --test src/middleware/twoPeople.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');

const MEMBERS = join(tmpdir(), `karwan-two-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-two-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'two-people-test-secret';
delete process.env.ADMIN_API_TOKEN;
delete process.env.SUPPORT_API_TOKEN;

const { Hono } = await import('hono');
const { adminDeskRoutes } = await import('../routes/adminDesk.js');
const { requireAdmin, useAdminDeskStoreForTests } = await import('./adminAuth.js');
const { twoPeople, setDeskReplay, useTwoPeopleForTests } = await import('./twoPeople.js');
const { adminRequestRoutes } = await import('../routes/adminRequests.js');
const { memoryAdminDeskStore } = await import('../db/adminDesk.js');
const { memoryAdminRequestStore } = await import('../db/adminRequests.js');
const { createInvite, redeemInvite, setDeskOwner, setDeskPages } = await import('../db/teamMembers.js');

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

const rows = memoryAdminDeskStore();
useAdminDeskStoreForTests(rows);
let clock = 1_800_000_000_000;
useTwoPeopleForTests({ store: memoryAdminRequestStore(), now: () => clock });

let released = 0;
let milestone = 0;
const app = new Hono();
app.route('/api/admin', adminDeskRoutes);
app.route('/api/admin', adminRequestRoutes);
const money = new Hono();
money.use('*', requireAdmin);
money.post(
  '/deals/:jobId/release',
  twoPeople({ key: 'release-test', label: 'Pay the next milestone', snapshot: async () => ({ milestone }) }),
  (c) => {
    released++;
    milestone++;
    return c.json({ ok: true, released });
  },
);
money.post('/usyc/run', twoPeople({ key: 'usyc-test', label: 'Run the wrap', dryRunMovesNothing: true }), (c) => c.json({ ran: c.req.query('dry') === '1' ? 'dry' : 'live' }));
app.route('/api/admin', money);
setDeskReplay((req) => Promise.resolve(app.fetch(req)));

const PASSWORD = 'correct horse battery staple';
let ip = 0;
async function call(method: string, path: string, token: string, opts: { body?: unknown; reason?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.7.0.${++ip}`, 'x-admin-token': token, ...(opts.headers ?? {}) };
  if (opts.reason) headers['x-desk-reason'] = opts.reason;
  return app.request(path, { method, headers, ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }) });
}
async function member(email: string, pages: string[]) {
  const { rawToken } = await createInvite({ email, name: email.split('@')[0]!, role: 'dev' });
  const r = await redeemInvite(rawToken, PASSWORD);
  assert.ok(r.ok);
  await setDeskPages(r.member.id, pages);
  return r.member;
}
async function tokenOf(email: string) {
  const res = await app.request('/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.6.0.${++ip}` },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return ((await res.json()) as { token: string }).token;
}

await member('owner@karwan.site', []);
await setDeskOwner('owner@karwan.site');
await member('ada@karwan.site', ['deals']);
await member('ben@karwan.site', ['deals']);
await member('cy@karwan.site', ['support']);
const ada = await tokenOf('ada@karwan.site');
const ben = await tokenOf('ben@karwan.site');
const cy = await tokenOf('cy@karwan.site');

async function ask(token = ada) {
  const res = await call('POST', '/api/admin/deals/0xd1/release', token, { body: {}, reason: 'Watcher missed the review end' });
  assert.equal(res.status, 202);
  return ((await res.json()) as { request: { id: string; status: string } }).request;
}

test('a money route opens a request and moves nothing; it needs a reason', async () => {
  assert.equal((await call('POST', '/api/admin/deals/0xd1/release', ada, { body: {} })).status, 400);
  const before = released;
  const r = await ask();
  assert.equal(r.status, 'pending');
  assert.equal(released, before);
});

test('the member who asked cannot approve it; a member without the page cannot either', async () => {
  const r = await ask();
  assert.equal((await call('POST', `/api/admin/requests/${r.id}/approve`, ada)).status, 403);
  assert.equal((await call('POST', `/api/admin/requests/${r.id}/approve`, cy)).status, 403);
});

test('a second member with the page runs it once, as themselves, with both names kept', async () => {
  const r = await ask();
  const before = released;
  const ok = await call('POST', `/api/admin/requests/${r.id}/approve`, ben);
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { request: { status: string; requestedBy: { email: string }; approvedBy: { email: string } } };
  assert.equal(body.request.status, 'done');
  assert.equal(body.request.requestedBy.email, 'ada@karwan.site');
  assert.equal(body.request.approvedBy.email, 'ben@karwan.site');
  assert.equal(released, before + 1);
  assert.equal((await call('POST', `/api/admin/requests/${r.id}/approve`, ben)).status, 409, 'never twice');
  assert.equal(released, before + 1);
  const ran = (await rows.listActions({ limit: 200 })).find((x) => x.path === '/api/admin/deals/0xd1/release' && x.outcome === 'done');
  assert.equal(ran?.memberEmail, 'ben@karwan.site');
});

test('a target that moved after it was asked for is refused, and nothing runs', async () => {
  const r = await ask();
  milestone += 5;
  const before = released;
  assert.equal((await call('POST', `/api/admin/requests/${r.id}/approve`, ben)).status, 409);
  assert.equal(released, before);
});

test('a request older than 24 hours cannot be approved', async () => {
  const r = await ask();
  clock += 24 * 60 * 60 * 1000 + 1;
  assert.equal((await call('POST', `/api/admin/requests/${r.id}/approve`, ben)).status, 409);
  clock += 1;
});

test('nobody runs a money route alone by claiming an approval', async () => {
  const r = await ask();
  const before = released;
  const forged = await call('POST', '/api/admin/deals/0xd1/release', ada, { body: {}, headers: { 'x-desk-approved': r.id, 'x-desk-replay': 'guess' } });
  assert.equal(forged.status, 403);
  assert.equal(released, before);
});

test('the asker or the owner can withdraw a pending request', async () => {
  const r = await ask();
  assert.equal((await call('POST', `/api/admin/requests/${r.id}/cancel`, ben)).status, 403);
  assert.equal((await call('POST', `/api/admin/requests/${r.id}/cancel`, ada)).status, 200);
  assert.equal((await call('POST', `/api/admin/requests/${r.id}/approve`, ben)).status, 409);
});

test('a dry run moves nothing, so it runs without a request', async () => {
  const owner = await tokenOf('owner@karwan.site');
  const dry = await call('POST', '/api/admin/usyc/run?dry=1', owner, { body: {} });
  assert.equal(dry.status, 200);
  assert.deepEqual(await dry.json(), { ran: 'dry' });
  assert.equal((await call('POST', '/api/admin/usyc/run', owner, { body: {}, reason: 'Cooldown matured' })).status, 202);
});
