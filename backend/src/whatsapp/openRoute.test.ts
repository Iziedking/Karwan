import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenRoute } from './openRoute.js';

function setup(redeemed: { address: string; path: '/verify/person' | '/profile' } | null) {
  const sessions: string[] = [];
  const app = createOpenRoute({
    webBase: 'https://karwan.site',
    redeem: async () => redeemed,
    signIn: (_c, address) => {
      sessions.push(address);
    },
  });
  return { app, sessions };
}

test('a valid link signs the account in and opens the page it names', async () => {
  const { app, sessions } = setup({ address: '0xada', path: '/verify/person' });
  const res = await app.request('/open?t=tok1');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://karwan.site/verify/person');
  assert.deepEqual(sessions, ['0xada']);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('an expired or used link signs nobody in and says so on the site', async () => {
  const { app, sessions } = setup(null);
  const res = await app.request('/open?t=old');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://karwan.site/?link=expired');
  assert.equal(sessions.length, 0);
});

test('a missing token is refused', async () => {
  const { app } = setup({ address: '0xada', path: '/profile' });
  assert.equal((await app.request('/open')).status, 400);
});
