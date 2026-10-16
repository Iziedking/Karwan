import assert from 'node:assert/strict';
import test from 'node:test';
import { recipientsFor, summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

const ev = (waitingOn: string | null, buyerConfirmed = true) =>
  ({
    type: 'request.world_check',
    jobId: '0xjob',
    actor: 'platform',
    ts: 0,
    payload: { buyer: '0xb', seller: '0xs', priceUsdc: '1200', waitingOn, buyerConfirmed },
  }) as unknown as KarwanEvent;

test('the seller hears in chat when a buyer is waiting on their World ID check', async () => {
  assert.deepEqual(await recipientsFor(ev('seller')), [{ address: '0xs', role: 'seller' }]);
  const s = summaryFor(ev('seller'), 'seller');
  assert.match(s!.text, /confirm with World ID/i);
});

test('nobody is messaged before the buyer confirms or once the step is done', async () => {
  assert.deepEqual(await recipientsFor(ev('seller', false)), []);
  assert.deepEqual(await recipientsFor(ev(null)), []);
});
