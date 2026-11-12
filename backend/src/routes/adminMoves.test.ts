import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// Money moves on the desk (view 79): the Money moves page reads it; nobody
/// else does.
///
///   npx tsx --test src/routes/adminMoves.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');

const MEMBERS = join(tmpdir(), `karwan-moves-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-moves-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'moves-test-secret';
delete process.env.ADMIN_API_TOKEN;
delete process.env.SUPPORT_API_TOKEN;

const { Hono } = await import('hono');
const { adminDeskRoutes } = await import('./adminDesk.js');
const { adminMovesRoutes, useMovesForTests } = await import('./adminMoves.js');
const { useAdminDeskStoreForTests } = await import('../middleware/adminAuth.js');
const { memoryAdminDeskStore } = await import('../db/adminDesk.js');
const { createInvite, redeemInvite, setDeskOwner } = await import('../db/teamMembers.js');

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

useAdminDeskStoreForTests(memoryAdminDeskStore());
const app = new Hono();
app.route('/api/admin', adminDeskRoutes);
app.route('/api/admin', adminMovesRoutes);

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
await call('PUT', `/api/admin/access/${pat.id}`, ownerToken, { access: { payments: 'read' } });

const NOW = Date.now();
let asked: { since: number; limit: number } | null = null;
useMovesForTests({
  list: async (q) => {
    asked = q;
    return [
      {
        reference: 'KWN-DONE', operationKey: 'op1', kind: 'deposit', state: 'completed', version: 1, attempt: 1, currency: 'USDC', amountMicros: '20000000',
        initiatedBy: '0xa', participants: [], summary: 's', nextActor: 'none', legs: [], createdAt: NOW - 60_000, updatedAt: NOW - 60_000, completedAt: NOW - 60_000,
      },
      {
        reference: 'KWN-STUCK', operationKey: 'op2', kind: 'cash_out', state: 'submitted', version: 1, attempt: 1, currency: 'USDC', amountMicros: '30000000',
        initiatedBy: '0xb', participants: [], summary: 's', nextActor: 'karwan', legs: [], createdAt: NOW - 3 * 3_600_000, updatedAt: NOW - 3 * 3_600_000,
      },
    ];
  },
  handles: async () => new Map([['0xb', 'ibrahim']]),
});

test('a teammate with Money moves reads stuck first, with counts', async () => {
  const r = await call('GET', '/api/admin/money-moves', await tokenOf('pat@karwan.site'));
  assert.equal(r.status, 200);
  const body = (await r.json()) as { rows: Array<{ reference: string; who: string }>; counts: Record<string, number> };
  assert.deepEqual(body.rows.map((x) => x.reference), ['KWN-STUCK', 'KWN-DONE']);
  assert.equal(body.rows[0]!.who, '@ibrahim');
  assert.deepEqual(body.counts, { stuck: 1, moving: 0, failed: 0, done: 1 });
  assert.ok(asked && asked.since <= NOW - 7 * 24 * 3_600_000 + 60_000);
});

test('a teammate without Money moves is refused', async () => {
  assert.equal((await call('GET', '/api/admin/money-moves', await tokenOf('sam@karwan.site'))).status, 403);
});

test('signed out is refused', async () => {
  assert.equal((await call('GET', '/api/admin/money-moves')).status, 401);
});
