import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SESSION_SECRET = 'whatsapp-in-process-test-session-secret';
const { verifySession } = await import('../auth/session.js');
const { callAsAccount, installApp } = await import('./inProcess.js');

test('calls a route with a session minted for the account', async () => {
  let seen: Request | null = null;
  installApp({
    request: async (path, init) => {
      seen = new Request(`http://local${path}`, init);
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  const r = await callAsAccount('0xABC0000000000000000000000000000000000001', 'POST', '/api/deals/x/release', { a: 1 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  const req = seen as unknown as Request;
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.get('sec-fetch-site'), 'same-origin');
  assert.equal(req.headers.get('x-real-ip'), 'chat:0xabc0000000000000000000000000000000000001', 'each chat account has its own rate-limit bucket');
  const token = /karwan_session=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1] ?? '';
  const session = verifySession(token);
  assert.equal(session?.address, '0xabc0000000000000000000000000000000000001');
  assert.equal(session?.method, 'circle');
  assert.deepEqual(await req.json(), { a: 1 });
});

test('a non-JSON answer still returns its status', async () => {
  installApp({ request: async () => new Response('not json', { status: 502 }) });
  const r = await callAsAccount('0x1', 'GET', '/api/x');
  assert.equal(r.status, 502);
  assert.deepEqual(r.json, {});
});
