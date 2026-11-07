import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { rateLimit } from './rateLimit.js';

/// The limit can depend on the request: the assistant page allows a signed-in
/// session more messages than an anonymous caller.
///
///   npx tsx --test src/middleware/rateLimit.test.ts

function app(max: number | ((c: import('hono').Context) => number)) {
  const a = new Hono();
  a.post('/x', rateLimit({ windowMs: 60_000, max, name: `t-${Math.random()}` }), (c) => c.json({ ok: true }));
  return a;
}
const hit = (a: Hono, signedIn: boolean) =>
  a.request('/x', { method: 'POST', headers: { 'x-real-ip': '1.2.3.4', ...(signedIn ? { 'x-signed-in': '1' } : {}) } });

test('a fixed limit refuses the request after it', async () => {
  const a = app(2);
  assert.equal((await hit(a, false)).status, 200);
  assert.equal((await hit(a, false)).status, 200);
  assert.equal((await hit(a, false)).status, 429);
});

test('a limit read from the request lets a signed-in caller send more', async () => {
  const a = app((c) => (c.req.header('x-signed-in') ? 3 : 1));
  assert.equal((await hit(a, true)).status, 200);
  assert.equal((await hit(a, true)).status, 200);
  assert.equal((await hit(a, true)).status, 200);
  assert.equal((await hit(a, true)).status, 429);
  const anon = app((c) => (c.req.header('x-signed-in') ? 3 : 1));
  assert.equal((await hit(anon, false)).status, 200);
  assert.equal((await hit(anon, false)).status, 429);
});

test('a limit switched off lets every request through and resumes where it was when switched back on', async () => {
  let on = true;
  const a = new Hono();
  a.post('/x', rateLimit({ windowMs: 60_000, max: 1, name: `t-${Math.random()}`, enabled: () => on }), (c) => c.json({ ok: true }));
  assert.equal((await hit(a, false)).status, 200);
  assert.equal((await hit(a, false)).status, 429);
  on = false;
  for (let i = 0; i < 5; i++) assert.equal((await hit(a, false)).status, 200);
  on = true;
  assert.equal((await hit(a, false)).status, 429);
});

test('a limit keyed on the email in the body counts that email from any address, and the route can still read the body', async () => {
  const a = new Hono();
  const byEmail = rateLimit({
    windowMs: 60_000,
    max: 2,
    name: `t-${Math.random()}`,
    key: async (c) => {
      const body = (await c.req.json().catch(() => null)) as { email?: string } | null;
      return body?.email ? body.email.toLowerCase() : null;
    },
  });
  a.post('/x', byEmail, async (c) => c.json({ echoed: ((await c.req.json()) as { email: string }).email }));
  const send = (ip: string, email: string) =>
    a.request('/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify({ email }) });
  const first = await send('1.1.1.1', 'Ada@x.co');
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { echoed: 'Ada@x.co' });
  assert.equal((await send('2.2.2.2', 'ada@x.co')).status, 200);
  assert.equal((await send('3.3.3.3', 'ada@x.co')).status, 429);
  assert.equal((await send('3.3.3.3', 'bo@x.co')).status, 200);
});

test('a limit keyed on a person falls back to the address when there is no key', async () => {
  const a = new Hono();
  a.post('/x', rateLimit({ windowMs: 60_000, max: 1, name: `t-${Math.random()}`, key: (c) => c.req.header('x-person') ?? null }), (c) => c.json({ ok: true }));
  const send = (ip: string, person?: string) => a.request('/x', { method: 'POST', headers: { 'x-real-ip': ip, ...(person ? { 'x-person': person } : {}) } });
  assert.equal((await send('1.1.1.1', 'p1')).status, 200);
  assert.equal((await send('9.9.9.9', 'p1')).status, 429);
  assert.equal((await send('1.1.1.1', 'p2')).status, 200);
  assert.equal((await send('5.5.5.5')).status, 200);
  assert.equal((await send('5.5.5.5')).status, 429);
});
