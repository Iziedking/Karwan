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

test('a verified join returns an answer token that lets the person say what they will use Karwan for', async () => {
  const { __test } = await import('./waitlist.js');
  const codes: string[] = [];
  __test.setCodeSink((c) => codes.push(c));
  await post('/request', { email: 'dana@example.com', locale: 'en' });
  const joined = (await (await post('/verify', { email: 'dana@example.com', code: codes.at(-1) })).json()) as { answerToken: string };
  assert.equal(typeof joined.answerToken, 'string');
  assert.equal((await post('/use-case', { token: joined.answerToken, useCases: ['not_a_choice'] })).status, 400);
  assert.equal((await post('/use-case', { token: joined.answerToken, useCases: [] })).status, 400);
  assert.equal((await post('/use-case', { token: 'x'.repeat(32), useCases: ['buy_goods'] })).status, 400);
  assert.equal((await post('/use-case', { token: joined.answerToken, useCases: ['buy_goods', 'sell_services'] })).status, 200);
});

test('one email gets at most four codes in 15 minutes, with the IP limits switched off', async () => {
  const { setFormLimits } = await import('../db/formLimits.js');
  await setFormLimits(false, 'test');
  try {
    for (let i = 0; i < 4; i++) assert.equal((await post('/request', { email: 'eve@example.com', locale: 'en' })).status, 200);
    const fifth = await post('/request', { email: 'eve@example.com', locale: 'en' });
    assert.equal(fifth.status, 429);
    const body = (await fifth.json()) as { code: string; retryAfterSeconds: number };
    assert.equal(body.code, 'too_many_codes');
    assert.ok(body.retryAfterSeconds > 0);
    assert.equal((await post('/request', { email: 'frank@example.com', locale: 'en' })).status, 200);
  } finally {
    await setFormLimits(true, 'test');
  }
});

test('the IP limit on code requests counts again once the switch is back on', async () => {
  let last = 0;
  for (let i = 0; i < 8; i++) last = (await post('/request', { email: `ip${i}@example.com`, locale: 'en' })).status;
  assert.equal(last, 429);
});
