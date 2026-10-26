import assert from 'node:assert/strict';
import test from 'node:test';
import { RELEVANT, recipientsFor, summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

/// The delivery date (owner, 26 Oct 2026): the seller is reminded before it,
/// both sides hear when it passes, and while the buyer's answer to a request
/// for more time holds the refund the buyer is reminded.
const ev = (type: string, payload: Record<string, unknown> = {}) =>
  ({ type, jobId: '0xdeal', actor: 'platform', ts: 0, payload: { buyer: '0xb', seller: '0xs', ...payload } }) as unknown as KarwanEvent;

const refundAt = Date.UTC(2026, 9, 28, 9, 0);

test('the delivery-date messages are sent', () => {
  for (const type of ['deal.deadline.soon', 'deal.deadline.passed', 'deal.extension.waiting']) assert.ok(RELEVANT.has(type), type);
});

test('only the seller is reminded before the date', async () => {
  const soon = ev('deal.deadline.soon', { dueAt: Date.UTC(2026, 9, 27, 9, 0), refundAt });
  assert.deepEqual(await recipientsFor(soon), [{ address: '0xs', role: 'seller' }]);
  const text = summaryFor(soon, 'seller')!.text;
  assert.match(text, /27 Oct/);
  assert.match(text, /more time/);
  assert.equal(summaryFor(soon, 'buyer'), null);
});

test('both sides hear the date passed, and an open request holds the money', async () => {
  const passed = ev('deal.deadline.passed', { refundAt, askedForMoreTime: false });
  assert.deepEqual(await recipientsFor(passed), [{ address: '0xb', role: 'buyer' }, { address: '0xs', role: 'seller' }]);
  assert.match(summaryFor(passed, 'buyer')!.text, /comes back to you automatically/);
  assert.match(summaryFor(passed, 'seller')!.text, /28 Oct/);
  const asked = ev('deal.deadline.passed', { refundAt, askedForMoreTime: true, additionalSeconds: 3 * 86_400 });
  assert.match(summaryFor(asked, 'buyer')!.text, /3 more days/);
  assert.match(summaryFor(asked, 'buyer')!.text, /until you answer/);
  assert.match(summaryFor(asked, 'seller')!.text, /until they answer/);
});

test('the buyer is reminded each time; the seller hears only the first time', async () => {
  const first = ev('deal.extension.waiting', { additionalSeconds: 86_400, reminder: 1 });
  assert.deepEqual(await recipientsFor(first), [{ address: '0xb', role: 'buyer' }, { address: '0xs', role: 'seller' }]);
  assert.match(summaryFor(first, 'buyer')!.text, /1 more day/);
  assert.match(summaryFor(first, 'seller')!.text, /has not answered/);
  const second = ev('deal.extension.waiting', { additionalSeconds: 86_400, reminder: 2 });
  assert.deepEqual(await recipientsFor(second), [{ address: '0xb', role: 'buyer' }]);
});
