import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SESSION_SECRET ??= 'whatsapp-open-test-secret-at-least-32-characters';
const { whatsappRoutes } = await import('./whatsapp.js');
const { channelRoutes } = await import('./channels.js');
const { chatOpenLinks } = await import('../channels/openLinksLive.js');
const { verifySession, COOKIE_NAME } = await import('../auth/session.js');

async function opensForHalfAnHour(app: { request: (path: string) => Response | Promise<Response> }) {
  const token = await chatOpenLinks.mint('0xada', '/verify/person');
  assert.ok(token);
  const before = Math.floor(Date.now() / 1000);
  const res = await app.request(`/open?t=${token}`);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') ?? '', /\/verify\/person$/);
  const cookie = res.headers.get('set-cookie') ?? '';
  const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
  assert.ok(maxAge > 0 && maxAge <= 1800, `cookie Max-Age is ${maxAge}`);
  const session = verifySession(decodeURIComponent(new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(cookie)?.[1] ?? ''));
  assert.ok(session, 'the cookie carries a valid session');
  assert.ok(session.exp <= before + 1800 + 1, `session expires in ${session.exp - before} seconds`);
  assert.equal((await app.request(`/open?t=${token}`)).headers.get('set-cookie'), null, 'a link works once');
}

test('the channel link signs in for half an hour, once', async () => {
  await opensForHalfAnHour(channelRoutes);
});

test('links already sent from WhatsApp still open the same way', async () => {
  await opensForHalfAnHour(whatsappRoutes);
});
