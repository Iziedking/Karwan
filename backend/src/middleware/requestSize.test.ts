import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { MAX_REQUEST_BYTES, requestSizeLimit } from './requestSize.js';

/// One size ceiling for every API request (view 69).
///
///   npx tsx --test src/middleware/requestSize.test.ts

function app() {
  const a = new Hono();
  a.use('*', requestSizeLimit);
  a.post('/echo', async (c) => {
    const body = await c.req.text();
    return c.json({ bytes: body.length });
  });
  a.get('/read', (c) => c.json({ ok: true }));
  return a;
}

test('the ceiling sits above the largest upload, 12 MB of base64 screenshots', () => {
  assert.equal(MAX_REQUEST_BYTES, 20 * 1024 * 1024);
  assert.ok(Math.ceil((12 * 1024 * 1024 * 4) / 3) < MAX_REQUEST_BYTES);
});

test('a body under the ceiling reaches the route', async () => {
  const res = await app().request('/echo', { method: 'POST', body: 'x'.repeat(1024) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { bytes: 1024 });
});

test('a body over the ceiling is refused with 413 before the route reads it', async () => {
  const res = await app().request('/echo', {
    method: 'POST',
    body: new Uint8Array(MAX_REQUEST_BYTES + 1),
  });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'request too large', code: 'request_too_large' });
});

test('a declared length over the ceiling is refused too', async () => {
  const res = await app().request('/echo', {
    method: 'POST',
    headers: { 'content-length': String(MAX_REQUEST_BYTES + 1) },
    body: 'small',
  });
  assert.equal(res.status, 413);
});

test('reads without a body pass', async () => {
  const res = await app().request('/read');
  assert.equal(res.status, 200);
});
