import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SESSION_SECRET ??= 'whatsapp-open-test-secret-at-least-32-characters';
const { whatsappRoutes, setOpenRedeemer } = await import('./whatsapp.js');
const { verifySession, COOKIE_NAME } = await import('../auth/session.js');

test('the one-time link signs in for half an hour, not for a month', async () => {
  setOpenRedeemer(async () => ({ address: '0xada', path: '/verify/person' }));
  const before = Math.floor(Date.now() / 1000);
  const res = await whatsappRoutes.request('/open?t=tok1');
  assert.equal(res.status, 302);
  const cookie = res.headers.get('set-cookie') ?? '';
  const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
  assert.ok(maxAge > 0 && maxAge <= 1800, `cookie Max-Age is ${maxAge}`);
  const token = new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(cookie)?.[1] ?? '';
  const session = verifySession(decodeURIComponent(token));
  assert.ok(session, 'the cookie carries a valid session');
  assert.ok(session.exp <= before + 1800 + 1, `session expires in ${session.exp - before} seconds`);
});
