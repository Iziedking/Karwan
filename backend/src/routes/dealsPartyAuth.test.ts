import assert from 'node:assert/strict';
import test from 'node:test';
import { dealsRoutes } from './deals.js';

const JOB = `0x${'ab'.repeat(32)}`;
const BUYER = `0x${'11'.repeat(20)}`;

test('arrival cannot be confirmed by naming the buyer without the buyer session', async () => {
  const response = await dealsRoutes.request(`/direct/${JOB}/arrived`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caller: BUYER }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'forbidden');
});
