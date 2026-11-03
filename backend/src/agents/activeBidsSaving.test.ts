import assert from 'node:assert/strict';
import test from 'node:test';
import { activeBidsForSaving } from './seller.js';

test('an offer is never saved as mid-reply, so a restart cannot leave it ignoring counters', () => {
  const live = { finalized: false, responding: true, lastBidPrice: '90' };
  const saved = activeBidsForSaving(new Map([['job:seller', live]]));
  assert.equal(saved['job:seller']?.responding, false);
  assert.equal(saved['job:seller']?.lastBidPrice, '90');
  assert.equal(live.responding, true, 'the running reply keeps its lock');
});

test('only negotiations still in flight are saved', () => {
  const saved = activeBidsForSaving(new Map([
    ['open', { finalized: false, responding: false }],
    ['done', { finalized: true, responding: false }],
  ]));
  assert.deepEqual(Object.keys(saved), ['open']);
});

test('a finished offer with a reply still to send is kept, so the reply goes out after a restart', () => {
  const saved = activeBidsForSaving(new Map([
    ['accepted-not-sent', { finalized: true, responding: false, pendingReply: { key: 'reply:job:seller:ref', accept: true, priceWei: '0', deadlineUnix: 0 } }],
    ['accepted-sent', { finalized: true, responding: false }],
  ]));
  assert.deepEqual(Object.keys(saved), ['accepted-not-sent']);
});
