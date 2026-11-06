import { test } from 'node:test';
import assert from 'node:assert/strict';

/// Signed-in devices (view 65).
///
///   npx tsx --test src/auth/sessionRecords.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run against a real database');
process.env.SESSION_SECRET = 'session-records-test-secret-32-chars!!';

const { Hono } = await import('hono');
const { createClosedList, deviceName, memorySessionRecordStore } = await import('./sessionRecords.js');
const session = await import('./session.js');

const store = memorySessionRecordStore();
session.useSessionRecordsForTests(store);

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const app = new Hono();
app.use('*', session.sessionUpkeep);
app.post('/sign-in/:address', async (c) => {
  await session.setSessionCookie(c, { address: c.req.param('address'), method: 'circle' });
  return c.json({ ok: true });
});
app.get('/me', (c) => {
  const s = session.readSession(c);
  return s ? c.json({ address: s.address, sid: s.sid ?? null }) : c.json({ error: 'not signed in' }, 401);
});

function cookieOf(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0]!;
}

async function signIn(address: string, ua = CHROME_WIN) {
  const res = await app.request(`/sign-in/${address}`, { method: 'POST', headers: { 'user-agent': ua } });
  return cookieOf(res);
}

const me = (cookie: string) => app.request('/me', { headers: { cookie } });

test('device names are plain and coarse', () => {
  assert.equal(deviceName(CHROME_WIN), 'Chrome on Windows');
  assert.equal(deviceName(SAFARI_IPHONE), 'Safari on iPhone');
  assert.equal(deviceName(''), 'Unknown device');
});

test('every sign-in gets a record, and the cookie names it', async () => {
  const cookie = await signIn('0xaaa1', SAFARI_IPHONE);
  const body = (await (await me(cookie)).json()) as { sid: string };
  assert.ok(body.sid);
  const rec = await store.get(body.sid);
  assert.equal(rec?.address, '0xaaa1');
  assert.equal(rec?.device, 'Safari on iPhone');
});

test('a closed session stops at the next request on this server', async () => {
  const cookie = await signIn('0xaaa2');
  const { sid } = (await (await me(cookie)).json()) as { sid: string };
  assert.equal(await session.closeSession('0xaaa2', sid), true);
  assert.equal((await me(cookie)).status, 401);
});

test('nobody closes a session on another account', async () => {
  const cookie = await signIn('0xaaa3');
  const { sid } = (await (await me(cookie)).json()) as { sid: string };
  assert.equal(await session.closeSession('0xbbbb', sid), false);
  assert.equal((await me(cookie)).status, 200);
});

test('sign out everywhere closes every session of that account and no one else’s', async () => {
  const a = await signIn('0xaaa4');
  const b = await signIn('0xaaa4', SAFARI_IPHONE);
  const other = await signIn('0xccc4');
  assert.equal(await session.closeAllSessions('0xaaa4'), 2);
  assert.equal((await me(a)).status, 401);
  assert.equal((await me(b)).status, 401);
  assert.equal((await me(other)).status, 200);
});

test('a cookie from before records gets one on its first request and keeps working', async () => {
  const legacy = session.signSession({ address: '0xaaa5', method: 'web3' });
  const res = await me(`karwan_session=${legacy}`);
  assert.equal(res.status, 200);
  const fresh = cookieOf(res);
  assert.ok(fresh.startsWith('karwan_session='), 'a new cookie with a record');
  const { sid } = (await (await me(fresh)).json()) as { sid: string };
  assert.ok(sid);
  assert.equal((await store.openFor('0xaaa5', Date.now())).length, 1);
});

test('a chat’s in-process token never makes a record', async () => {
  const before = (await store.openFor('0xaaa6', Date.now())).length;
  const token = session.signSession({ address: '0xaaa6', method: 'circle', inp: true });
  assert.equal((await me(`karwan_session=${token}`)).status, 200);
  assert.equal((await store.openFor('0xaaa6', Date.now())).length, before);
});

test('an altered record id is refused', async () => {
  const cookie = await signIn('0xaaa7');
  const [name, value] = cookie.split('=');
  const [body, sig] = value!.split('.');
  const claims = JSON.parse(Buffer.from(body!, 'base64url').toString());
  const altered = Buffer.from(JSON.stringify({ ...claims, sid: 'someone-else' })).toString('base64url');
  assert.equal((await me(`${name}=${altered}.${sig}`)).status, 401);
});

test('a sign-out on another server arrives with the next refresh', async () => {
  const shared = memorySessionRecordStore();
  await shared.insert({ sid: 's1', address: '0x1', method: 'circle', device: 'x', createdAt: 0, lastSeenAt: 0, expiresAt: Date.now() + 60_000 });
  const here = createClosedList(() => shared.closedSince(Date.now()));
  await here.refresh();
  assert.equal(here.has('s1'), false);
  await shared.close('s1', Date.now());
  assert.equal(here.has('s1'), false, 'not until the refresh');
  await here.refresh();
  assert.equal(here.has('s1'), true);
});

test('a failed refresh keeps what this server closed', async () => {
  let fail = false;
  const list = createClosedList(async () => {
    if (fail) throw new Error('db down');
    return [];
  });
  list.add(['mine']);
  fail = true;
  await assert.rejects(list.refresh());
  assert.equal(list.has('mine'), true);
});
