import assert from 'node:assert/strict';
import test from 'node:test';
import { waitlistRoutes } from './waitlist.js';

const post = (path: string, body: unknown) =>
  waitlistRoutes.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a code is sent for a valid email and refused for a malformed one', async () => {
  assert.equal((await post('/request', { email: 'Ada@Example.com', locale: 'fr' })).status, 200);
  assert.equal((await post('/request', { email: 'not-an-email', locale: 'en' })).status, 400);
});

test('a wrong code does not join, and a code that was never sent is named', async () => {
  await post('/request', { email: 'bob@example.com', locale: 'en' });
  const wrong = await post('/verify', { email: 'bob@example.com', code: '000000' });
  assert.equal(wrong.status, 400);
  const never = await post('/verify', { email: 'carol@example.com', code: '123456' });
  assert.equal(never.status, 400);
  assert.equal(((await never.json()) as { code: string }).code, 'no_code');
});
