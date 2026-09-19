import assert from 'node:assert/strict';
import test from 'node:test';
import { recentErrors } from '../errorTracker.js';
import { clientErrorRoutes, sanitizeClientPath } from './clientErrors.js';

const post = (body: unknown) =>
  clientErrorRoutes.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body: JSON.stringify(body),
  });

test('a report keeps only the pathname and hides deal ids', () => {
  assert.equal(
    sanitizeClientPath(`/deals/0x${'ab'.repeat(32)}?caller=0x1111#terms`),
    '/deals/:id',
  );
  assert.equal(sanitizeClientPath('app'), '/app');
});

test('a browser crash lands in the error tracker the admin page reads', async () => {
  const response = await post({
    message: 'Rendered more hooks than during the previous render.',
    digest: 'd1',
    path: `/deals/0x${'cd'.repeat(32)}?x=1`,
    boundary: 'deal',
  });
  assert.equal(response.status, 204);
  const latest = recentErrors(1)[0];
  assert.equal(latest?.scope, 'client.deal');
  assert.equal(latest?.message, 'Rendered more hooks than during the previous render.');
  assert.deepEqual(latest?.context, { path: '/deals/:id', digest: 'd1' });
});

test('malformed or oversized reports are refused', async () => {
  assert.equal((await post({ message: '', path: '/', boundary: 'app' })).status, 400);
  assert.equal((await post({ message: 'x'.repeat(501), path: '/', boundary: 'app' })).status, 400);
  assert.equal((await post({ message: 'x', path: '/', boundary: 'other' })).status, 400);
});
