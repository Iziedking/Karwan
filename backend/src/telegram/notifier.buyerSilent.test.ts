import assert from 'node:assert/strict';
import test from 'node:test';
import { recipientsFor, summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

/// Buyer silence on the escrow family: the seller is asked, their agent may ask
/// for them, and the buyer is told when to answer. Each goes to one side only.
const ev = (payload: Record<string, unknown>) =>
  ({ type: 'deal.buyer_silent', jobId: '0xdeal', actor: 'platform', ts: 0, payload: { buyer: '0xb', seller: '0xs', ...payload } }) as unknown as KarwanEvent;

test('the prompt and the agent asking reach only the seller', async () => {
  assert.deepEqual(await recipientsFor(ev({ stage: 'prompt' })), [{ address: '0xs', role: 'seller' }]);
  assert.match(summaryFor(ev({ stage: 'prompt' }), 'seller')!.text, /Ask for payment/);
  assert.deepEqual(await recipientsFor(ev({ stage: 'raised', by: 'agent' })), [{ address: '0xs', role: 'seller' }]);
  assert.deepEqual(await recipientsFor(ev({ stage: 'raised', by: 'seller' })), []);
});

test('the buyer is told to answer within 72 hours, and nobody else', async () => {
  const answer = ev({ stage: 'answer', answerBy: Date.UTC(2026, 9, 27, 9, 0) });
  assert.deepEqual(await recipientsFor(answer), [{ address: '0xb', role: 'buyer' }]);
  const text = summaryFor(answer, 'buyer')!.text;
  assert.match(text, /goes to the seller/);
  assert.match(text, /27 Oct/);
  assert.equal(summaryFor(answer, 'seller'), null);
});
