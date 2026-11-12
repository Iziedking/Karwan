import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The admin desk's members, pages, keys and rows (view 64).
///
///   npx tsx --test src/routes/adminDesk.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');

const MEMBERS = join(tmpdir(), `karwan-desk-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-desk-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'desk-test-secret';
delete process.env.ADMIN_API_TOKEN;
delete process.env.SUPPORT_API_TOKEN;

const { Hono } = await import('hono');
const { adminDeskRoutes } = await import('./adminDesk.js');
const { requireAdmin, useAdminDeskStoreForTests } = await import('../middleware/adminAuth.js');
const { memoryAdminDeskStore } = await import('../db/adminDesk.js');
const { createInvite, redeemInvite, setDeskOwner, changePassword } = await import('../db/teamMembers.js');

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

const store = memoryAdminDeskStore();
useAdminDeskStoreForTests(store);

const app = new Hono();
app.route('/api/admin', adminDeskRoutes);
const guarded = new Hono();
guarded.use('*', requireAdmin);
guarded.get('/support', (c) => c.json({ ok: 'support' }));
guarded.post('/deals/:id/release', (c) => c.json({ ok: 'released' }));
guarded.get('/health', (c) => c.json({ ok: 'health' }));
app.route('/api/admin', guarded);

const PASSWORD = 'correct horse battery staple';
let ip = 0;
const json = (body: unknown, extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  'x-forwarded-for': `10.9.0.${++ip}`,
  ...extra,
  body: JSON.stringify(body),
});

async function call(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.8.0.${++ip}` };
  if (token) headers['x-admin-token'] = token;
  return app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function member(email: string, name: string) {
  const { rawToken } = await createInvite({ email, name, role: 'dev' });
  const r = await redeemInvite(rawToken, PASSWORD);
  assert.ok(r.ok);
  return r.member;
}

async function signIn(email: string, password = PASSWORD) {
  const { body, ...headers } = json({ email, password });
  return app.request('/api/admin/session', { method: 'POST', headers, body });
}

const owner = await member('owner@karwan.site', 'Owner');
await setDeskOwner('owner@karwan.site');
const ada = await member('ada@karwan.site', 'Ada');
const ben = await member('ben@karwan.site', 'Ben');

const tokenOf = async (email: string) => ((await (await signIn(email)).json()) as { token: string }).token;
const ownerToken = await tokenOf('owner@karwan.site');

test('a member with no pages cannot sign in, and a wrong password is refused', async () => {
  assert.equal((await signIn('ada@karwan.site')).status, 403);
  assert.equal((await signIn('owner@karwan.site', 'wrong password here')).status, 401);
  const rows = await store.listActions({ limit: 50 });
  assert.ok(rows.some((r) => r.via === 'sign-in' && r.outcome === 'refused' && r.memberEmail === 'ada@karwan.site'));
});

test('the owner ticks pages and the member reaches only those routes', async () => {
  const set = await call('PUT', `/api/admin/access/${ada.id}`, ownerToken, { pages: ['support', 'nope'] });
  assert.equal(set.status, 200);
  assert.deepEqual(((await set.json()) as { member: { deskPages: string[] } }).member.deskPages, ['support']);

  const adaToken = await tokenOf('ada@karwan.site');
  assert.equal((await call('GET', '/api/admin/support', adaToken)).status, 200);
  assert.equal((await call('GET', '/api/admin/health', adaToken)).status, 403);
  assert.equal((await call('POST', '/api/admin/deals/0xabc/release', adaToken, {})).status, 403);
  const me = (await (await call('GET', '/api/admin/session', adaToken)).json()) as { me: { pages: string[]; owner: boolean } };
  assert.deepEqual(me.me, { ...me.me, pages: ['support'], owner: false });
});

test('only the owner changes access, and nobody changes the owner', async () => {
  await call('PUT', `/api/admin/access/${ben.id}`, ownerToken, { pages: ['deals', 'support'] });
  const benToken = await tokenOf('ben@karwan.site');
  assert.equal((await call('PUT', `/api/admin/access/${ada.id}`, benToken, { pages: ['deals'] })).status, 403);
  assert.equal((await call('PUT', `/api/admin/access/${ben.id}`, benToken, { pages: ['usyc'] })).status, 403);
  assert.equal((await call('PUT', `/api/admin/access/${owner.id}`, ownerToken, { pages: [] })).status, 409);
});

test('every change leaves a row with the member and result; a refusal leaves one too', async () => {
  const benToken = await tokenOf('ben@karwan.site');
  assert.equal((await call('POST', '/api/admin/deals/0xrow/release', benToken, { reason: 'stuck', password: 'nope' })).status, 200);
  const rows = await store.listActions({ limit: 100 });
  const done = rows.find((r) => r.path === '/api/admin/deals/0xrow/release' && r.outcome === 'done');
  assert.ok(done);
  assert.equal(done.memberEmail, 'ben@karwan.site');
  assert.equal(done.via, 'session');
  assert.deepEqual(done.request, { reason: 'stuck', password: '[removed]' });
  assert.deepEqual(done.result, { ok: 'released' });
  assert.ok(rows.some((r) => r.path === `/api/admin/access/${ada.id}` && r.outcome === 'refused' && r.memberEmail === 'ben@karwan.site'));
  assert.equal(rows.some((r) => r.method === 'GET' && r.outcome === 'done'), false, 'a read that goes through leaves no row');
  assert.ok(rows.some((r) => r.method === 'GET' && r.outcome === 'refused' && r.path === '/api/admin/health'), 'a refused read does');
});

test('a key works with its member’s pages, is shown once, and the row names the member', async () => {
  const benToken = await tokenOf('ben@karwan.site');
  const made = (await (await call('POST', '/api/admin/keys', benToken, { label: 'stranded scan' })).json()) as { rawKey: string; key: { id: string } };
  assert.match(made.rawKey, /^karwandesk_/);
  assert.equal((await call('GET', '/api/admin/support', made.rawKey)).status, 200);
  assert.equal((await call('GET', '/api/admin/health', made.rawKey)).status, 403);
  const listed = (await (await call('GET', '/api/admin/keys', benToken)).json()) as { keys: Array<Record<string, unknown>> };
  assert.equal(listed.keys.length, 1);
  assert.equal('keyHash' in listed.keys[0]!, false);
  const rows = await store.listActions({ limit: 100 });
  const keyRow = rows.find((r) => r.path === '/api/admin/keys' && r.method === 'POST');
  assert.equal((keyRow?.result as { rawKey?: string }).rawKey, '[removed]', 'the key never lands on a row');
  assert.equal((await call('DELETE', `/api/admin/keys/${made.key.id}`, benToken)).status, 200);
  assert.equal((await call('GET', '/api/admin/support', made.rawKey)).status, 401);
});

test('revoke ends the member’s sessions and keys at once', async () => {
  const benToken = await tokenOf('ben@karwan.site');
  const key = ((await (await call('POST', '/api/admin/keys', benToken, { label: 'ci' })).json()) as { rawKey: string }).rawKey;
  const r = await call('POST', `/api/admin/access/${ben.id}/revoke`, ownerToken);
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { keysEnded: number }).keysEnded, 1);
  assert.equal((await call('GET', '/api/admin/support', benToken)).status, 401);
  assert.equal((await call('GET', '/api/admin/support', key)).status, 401);
  assert.equal((await signIn('ben@karwan.site')).status, 403);
});

test('taking a page away ends the sessions minted with it', async () => {
  await call('PUT', `/api/admin/access/${ada.id}`, ownerToken, { pages: ['support', 'deals'] });
  const wide = await tokenOf('ada@karwan.site');
  await call('PUT', `/api/admin/access/${ada.id}`, ownerToken, { pages: ['support'] });
  assert.equal((await call('GET', '/api/admin/support', wide)).status, 401);
  assert.equal((await call('GET', '/api/admin/support', await tokenOf('ada@karwan.site'))).status, 200);
});

test('a password change ends desk sessions too', async () => {
  const t = await tokenOf('ada@karwan.site');
  await changePassword(ada.id, 'another long password here');
  assert.equal((await call('GET', '/api/admin/support', t)).status, 401);
});

test('a forged or altered session is refused', async () => {
  const [p, payload, sig] = ownerToken.split('.');
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
  const altered = `${p}.${Buffer.from(JSON.stringify({ ...claims, id: ada.id })).toString('base64url')}.${sig}`;
  assert.equal((await call('GET', '/api/admin/health', altered)).status, 401);
  assert.equal((await call('GET', '/api/admin/health', 'desk.x.y')).status, 401);
  assert.equal((await call('GET', '/api/admin/health', ownerToken)).status, 200);
});

test('levels: read opens the page and refuses its changes; fix asks for a money move', async () => {
  const cal = await member('cal@karwan.site', 'Cal');
  const set = await call('PUT', `/api/admin/access/${cal.id}`, ownerToken, { access: { deals: 'read', support: 'change' } });
  assert.equal(set.status, 200);
  const calToken = await tokenOf('cal@karwan.site');
  assert.equal((await call('GET', '/api/admin/support', calToken)).status, 200);
  assert.equal((await call('POST', '/api/admin/deals/0xabc/release', calToken, {})).status, 403);
  const me = (await (await call('GET', '/api/admin/session', calToken)).json()) as { me: { access: Record<string, string> } };
  assert.deepEqual(me.me.access, { deals: 'read', support: 'change' });
  await call('PUT', `/api/admin/access/${cal.id}`, ownerToken, { access: { deals: 'fix', support: 'change' } });
  const again = await tokenOf('cal@karwan.site');
  assert.equal((await call('POST', '/api/admin/deals/0xabc/release', again, {})).status, 200);
});

test('lowering a level ends the sessions minted with the higher one', async () => {
  const dee = await member('dee@karwan.site', 'Dee');
  await call('PUT', `/api/admin/access/${dee.id}`, ownerToken, { access: { support: 'change' } });
  const deeToken = await tokenOf('dee@karwan.site');
  assert.equal((await call('GET', '/api/admin/support', deeToken)).status, 200);
  await call('PUT', `/api/admin/access/${dee.id}`, ownerToken, { access: { support: 'read' } });
  assert.equal((await call('GET', '/api/admin/support', deeToken)).status, 401);
});

test('every signed-in answer carries the session renewed 30 minutes from now', async () => {
  const { readDeskSession } = await import('../ops/deskSession.js');
  const r = await call('GET', '/api/admin/session', ownerToken);
  const renewed = r.headers.get('x-desk-session');
  assert.ok(renewed);
  const claims = readDeskSession(renewed, 'desk-test-secret', Date.now(), 'testnet');
  assert.ok(claims);
  assert.ok(Math.abs(claims.exp - (Date.now() + 30 * 60_000)) < 5_000);
});

test('signing out answers ok; there is nothing kept on the server to delete', async () => {
  const r = await call('DELETE', '/api/admin/session', ownerToken);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('on testnet the password alone signs in, as before', async () => {
  const r = (await (await signIn('owner@karwan.site')).json()) as { token?: string; step?: string };
  assert.ok(r.token);
  assert.equal(r.step, undefined);
});
