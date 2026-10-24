import assert from 'node:assert/strict';
import test from 'node:test';
import { recipientsFor, summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

/// A seller asked to set up their Karwan record hears it here, and only them.
const offers = {
  type: 'record.setup_needed', actor: 'platform', ts: 0,
  payload: { sellerUser: '0xowner', reason: 'offers' },
} as unknown as KarwanEvent;
const paidFirst = {
  type: 'record.setup_needed', jobId: '0xdeal', actor: 'platform', ts: 0,
  payload: { sellerUser: '0xowner', reason: 'deal' },
} as unknown as KarwanEvent;

test('the record reminder goes to the seller only, with what to do', async () => {
  assert.deepEqual(await recipientsFor(offers), [{ address: '0xowner', role: 'seller' }]);
  assert.match(summaryFor(offers, 'seller')!.text, /Set up your Karwan record/);
  assert.match(summaryFor(offers, 'seller')!.text, /set up my record/i);
  assert.equal(summaryFor(offers, 'buyer'), null);
});

test('a deal paid before the record says it will not count on it', async () => {
  assert.match(summaryFor(paidFirst, 'seller')!.text, /will not count on your record/);
});
