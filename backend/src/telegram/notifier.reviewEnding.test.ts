import assert from 'node:assert/strict';
import test from 'node:test';
import { recipientsFor, summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

/// A day before the buyer's review ends on the escrow family, only the buyer is
/// told: release, ask once for more time, or raise a problem; otherwise the
/// payment goes to the seller.
const ev = (payload: Record<string, unknown> = {}) =>
  ({ type: 'deal.review.ending', jobId: '0xdeal', actor: 'platform', ts: 0, payload: { buyer: '0xb', seller: '0xs', endsAt: Date.UTC(2026, 9, 27, 9, 0), canAskMoreTime: true, ...payload } }) as unknown as KarwanEvent;

test('only the buyer hears that review ends, with the three choices', async () => {
  assert.deepEqual(await recipientsFor(ev()), [{ address: '0xb', role: 'buyer' }]);
  const text = summaryFor(ev(), 'buyer')!.text;
  assert.match(text, /27 Oct/);
  assert.match(text, /more time/i);
  assert.match(text, /goes to the seller/);
  assert.equal(summaryFor(ev(), 'seller'), null);
});

test('a buyer who already had more time is not offered it again', () => {
  assert.doesNotMatch(summaryFor(ev({ canAskMoreTime: false }), 'buyer')!.text, /more time/i);
});
