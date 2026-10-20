import assert from 'node:assert/strict';
import test from 'node:test';
import { recipientsFor, summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

/// "Ask me first" reaches the owner of the selling agent, and only them.
///
///   npx tsx --test src/telegram/notifier.suggestion.test.ts

const suggestion = {
  type: 'agent.suggestion', actor: 'seller', ts: 0,
  payload: { sellerUser: '0xowner', jobId: '0xjob', priceUsdc: '35.00', title: 'Logo for a bakery' },
} as unknown as KarwanEvent;

test('the suggestion goes to the seller who asked to be asked first', async () => {
  assert.deepEqual(await recipientsFor(suggestion), [{ address: '0xowner', role: 'seller' }]);
  const s = summaryFor(suggestion, 'seller');
  assert.match(s!.text, /Your agent found a request that fits\. Make an offer\?/);
  assert.match(s!.text, /Logo for a bakery/);
});
