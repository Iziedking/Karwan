import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The mainnet desk asks for a code after the password (view 79).
///
///   npx tsx --test src/routes/adminDeskMainnet.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');

const MEMBERS = join(tmpdir(), `karwan-desk-mn-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-desk-mn-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'desk-mainnet-test-secret';
process.env.ARC_NETWORK = 'mainnet';
process.env.DESK_CODE_KEY = 'desk-code-test-key';
delete process.env.ADMIN_API_TOKEN;
delete process.env.SUPPORT_API_TOKEN;

const { Hono } = await import('hono');
const { adminDeskRoutes, useDeskAlertForTests } = await import('./adminDesk.js');
const { adminTeamMemberRoutes } = await import('./adminTeamMembers.js');
const { requireAdmin, useAdminDeskStoreForTests } = await import('../middleware/adminAuth.js');
const { memoryAdminDeskStore } = await import('../db/adminDesk.js');
const { createInvite, redeemInvite, setDeskOwner, setDeskAccess, getMember } = await import('../db/teamMembers.js');
const { totp } = await import('../ops/deskCode.js');

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

useAdminDeskStoreForTests(memoryAdminDeskStore());
const alerts: string[] = [];
useDeskAlertForTests(async (text: string) => {
  alerts.push(text);
});

const app = new Hono();
app.route('/api/admin', adminDeskRoutes);
app.route('/api/admin/team-members', adminTeamMemberRoutes);
const guarded = new Hono();
guarded.use('*', requireAdmin);
guarded.get('/support', (c) => c.json({ ok: 'support' }));
app.route('/api/admin', guarded);

const PASSWORD = 'correct horse battery staple';
let ip = 0;
async function post(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.7.0.${++ip}` };
  if (token) headers['x-admin-token'] = token;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}
async function get(path: string, token: string) {
  return app.request(path, { headers: { 'x-admin-token': token, 'x-forwarded-for': `10.7.1.${++ip}` } });
}
async function member(email: string) {
  const { rawToken } = await createInvite({ email, name: email.split('@')[0]!, role: 'dev' });
  const r = await redeemInvite(rawToken, PASSWORD);
  assert.ok(r.ok);
  await setDeskAccess(r.member.id, { support: 'change' });
  return r.member;
}

function fromBase32(s: string): Buffer {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
const codeNow = (secret: Buffer, offsetSteps = 0) => totp(secret, Math.floor(Date.now() / 30_000) + offsetSteps);

/// Signs in the first time on mainnet and sets up the code; returns the secret.
async function setUp(email: string): Promise<{ secret: Buffer; token: string }> {
  const first = (await (await post('/api/admin/session', { email, password: PASSWORD })).json()) as {
    step: string;
    ticket: string;
    otpauth: string;
    token?: string;
  };
  assert.equal(first.step, 'setup');
  assert.equal(first.token, undefined);
  const secret = fromBase32(new URL(first.otpauth.replace('otpauth://', 'https://')).searchParams.get('secret')!);
  const done = await post('/api/admin/session/code', { ticket: first.ticket, code: codeNow(secret) });
  assert.equal(done.status, 200);
  const body = (await done.json()) as { token: string; me: { email: string } };
  assert.equal(body.me.email, email);
  return { secret, token: body.token };
}

async function ticketFor(email: string): Promise<string> {
  return ((await (await post('/api/admin/session', { email, password: PASSWORD })).json()) as { ticket: string }).ticket;
}

await member('owner@karwan.site');
await setDeskOwner('owner@karwan.site');

test('the first mainnet sign-in sets up the code, and the secret is kept sealed', async () => {
  const ada = await member('ada@karwan.site');
  const { secret, token } = await setUp('ada@karwan.site');
  const saved = await getMember(ada.id);
  assert.ok(saved?.codeSecret);
  assert.ok(!saved.codeSecret.includes(secret.toString('base64url')));
  assert.equal((await get('/api/admin/support', token)).status, 200);
});

test('with a code set up, the password alone opens nothing', async () => {
  await member('ben@karwan.site');
  await setUp('ben@karwan.site');
  const r = (await (await post('/api/admin/session', { email: 'ben@karwan.site', password: PASSWORD })).json()) as {
    step: string;
    token?: string;
    otpauth?: string;
  };
  assert.equal(r.step, 'code');
  assert.equal(r.token, undefined);
  assert.equal(r.otpauth, undefined);
});

test('the same code twice is refused, and not counted as a wrong code', async () => {
  await member('cal@karwan.site');
  const { secret } = await setUp('cal@karwan.site');
  const again = await post('/api/admin/session/code', { ticket: await ticketFor('cal@karwan.site'), code: codeNow(secret) });
  assert.equal(again.status, 401);
  assert.deepEqual(await again.json(), { error: 'That code is not right.' });
  for (let i = 0; i < 4; i++) {
    assert.equal((await post('/api/admin/session/code', { ticket: await ticketFor('cal@karwan.site'), code: '000000' })).status, 401);
  }
  assert.equal((await post('/api/admin/session/code', { ticket: await ticketFor('cal@karwan.site'), code: codeNow(secret, 1) })).status, 200);
});

test('five wrong codes lock the email for 15 minutes and tell the team chat', async () => {
  await member('dee@karwan.site');
  await setUp('dee@karwan.site');
  const ticket = await ticketFor('dee@karwan.site');
  for (let i = 0; i < 4; i++) assert.equal((await post('/api/admin/session/code', { ticket, code: '000000' })).status, 401);
  const fifth = await post('/api/admin/session/code', { ticket, code: '000000' });
  assert.equal(fifth.status, 429);
  assert.deepEqual(await fifth.json(), { error: 'Too many wrong codes. Wait 15 minutes.' });
  const lines = alerts.filter((a) => a.includes('dee@karwan.site'));
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^Desk: 5 wrong mainnet codes for dee@karwan\.site at \d\d:\d\d Lagos\. Locked 15 minutes\.$/);
  assert.equal((await post('/api/admin/session', { email: 'dee@karwan.site', password: PASSWORD })).status, 429);
});

test('a ticket older than 5 minutes is refused', async () => {
  await member('eve@karwan.site');
  const { secret } = await setUp('eve@karwan.site');
  const ticket = await ticketFor('eve@karwan.site');
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 5 * 60_000 + 1000 });
  try {
    const r = await post('/api/admin/session/code', { ticket, code: codeNow(secret) });
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: 'Sign in again.' });
  } finally {
    mock.timers.reset();
  }
});

test('the owner resets a code: the member is signed out and sets it up again', async () => {
  const fay = await member('fay@karwan.site');
  const { token } = await setUp('fay@karwan.site');
  const ownerSet = await setUp('owner@karwan.site');
  const reset = await post(`/api/admin/team-members/${fay.id}/reset-code`, {}, ownerSet.token);
  assert.equal(reset.status, 200);
  assert.equal((await get('/api/admin/support', token)).status, 401);
  const next = (await (await post('/api/admin/session', { email: 'fay@karwan.site', password: PASSWORD })).json()) as { step: string };
  assert.equal(next.step, 'setup');
});

test('a testnet session is refused by the mainnet desk', async () => {
  const { mintDeskSession } = await import('../ops/deskSession.js');
  const gus = await member('gus@karwan.site');
  const testnet = mintDeskSession(gus, 'desk-mainnet-test-secret', Date.now(), 'testnet');
  assert.equal((await get('/api/admin/support', testnet.token)).status, 401);
});
