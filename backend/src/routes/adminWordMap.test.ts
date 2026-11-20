import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// Word map suggestions on the desk (view 95): teammates with the Matching page
/// read and dismiss them; nobody else does.
///
///   npx tsx --test src/routes/adminWordMap.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');

const MEMBERS = join(tmpdir(), `karwan-wordmap-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-wordmap-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'wordmap-test-secret';
delete process.env.ADMIN_API_TOKEN;
delete process.env.SUPPORT_API_TOKEN;

const { Hono } = await import('hono');
const { adminDeskRoutes } = await import('./adminDesk.js');
const { adminWordMapRoutes } = await import('./adminWordMap.js');
const { recordSuggestion, resetWordMapSuggestionsForTests } = await import('../db/wordMapSuggestions.js');
const { useAdminDeskStoreForTests } = await import('../middleware/adminAuth.js');
const { memoryAdminDeskStore } = await import('../db/adminDesk.js');
const { createInvite, redeemInvite, setDeskOwner } = await import('../db/teamMembers.js');

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

useAdminDeskStoreForTests(memoryAdminDeskStore());
const app = new Hono();
app.route('/api/admin', adminDeskRoutes);
app.route('/api/admin', adminWordMapRoutes);

const PASSWORD = 'correct horse battery staple';
let ip = 0;
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
const tokenOf = async (email: string) => ((await (await call('POST', '/api/admin/session', undefined, { email, password: PASSWORD })).json()) as { token: string }).token;

await member('owner@karwan.site', 'Owner');
await setDeskOwner('owner@karwan.site');
const ownerToken = await tokenOf('owner@karwan.site');
const sam = await member('sam@karwan.site', 'Sam');
const pat = await member('pat@karwan.site', 'Pat');
await call('PUT', `/api/admin/access/${sam.id}`, ownerToken, { access: { support: 'change' } });
await call('PUT', `/api/admin/access/${pat.id}`, ownerToken, { access: { matching: 'change' } });

beforeEach(() => resetWordMapSuggestionsForTests());

test('a teammate with Matching reads the open suggestions, most frequent first', async () => {
  await recordSuggestion(['roof leak'], ['plasterer'], 1);
  await recordSuggestion(['wedding gown'], ['bridal'], 2);
  await recordSuggestion(['wedding gown'], ['bridal'], 3);
  const r = await call('GET', '/api/admin/word-map', await tokenOf('pat@karwan.site'));
  assert.equal(r.status, 200);
  const body = (await r.json()) as { suggestions: Array<{ id: string; briefWords: string[]; sellerWords: string[]; count: number }> };
  assert.deepEqual(body.suggestions.map((s) => [s.briefWords.join(' '), s.sellerWords.join(' '), s.count]), [['gown wedding', 'bridal', 2], ['leak roof', 'plasterer', 1]]);
});

test('Dismiss puts one away for good', async () => {
  await recordSuggestion(['wedding gown'], ['bridal'], 1);
  const token = await tokenOf('pat@karwan.site');
  const list = (await (await call('GET', '/api/admin/word-map', token)).json()) as { suggestions: Array<{ id: string }> };
  const id = list.suggestions[0]!.id;
  const d = await call('POST', `/api/admin/word-map/${id}/dismiss`, token);
  assert.equal(d.status, 200);
  assert.deepEqual(await d.json(), { ok: true });
  const after = (await (await call('GET', '/api/admin/word-map', token)).json()) as { suggestions: unknown[] };
  assert.equal(after.suggestions.length, 0);
  assert.equal((await call('POST', `/api/admin/word-map/${id}/dismiss`, token)).status, 404);
});

test('a teammate without Matching is refused', async () => {
  assert.equal((await call('GET', '/api/admin/word-map', await tokenOf('sam@karwan.site'))).status, 403);
});

test('signed out is refused', async () => {
  assert.equal((await call('GET', '/api/admin/word-map')).status, 401);
});


test('the word map says whether matching by meaning is on and how many sellers have a vector', async () => {
  const r = await call('GET', '/api/admin/word-map', await tokenOf('pat@karwan.site'));
  const body = (await r.json()) as { meaning: { on: boolean; model: string | null; sellers: number; withVector: number } };
  assert.deepEqual(body.meaning, { on: false, model: null, sellers: 0, withVector: 0 });
});
