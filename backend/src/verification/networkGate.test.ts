import assert from 'node:assert/strict';
import test from 'node:test';
import { buyerVisible, sellerMayBid } from './networkGate.js';

test('with the verified network off, every seller may bid', () => {
  assert.deepEqual(sellerMayBid({ enabled: false, level: 'registered' }), { ok: true });
});

test('with it on, only work and id verified sellers bid', () => {
  assert.equal(sellerMayBid({ enabled: true, level: 'work_verified' }).ok, true);
  assert.equal(sellerMayBid({ enabled: true, level: 'id_verified' }).ok, true);
  const no = sellerMayBid({ enabled: true, level: 'person_verified' });
  assert.equal(no.ok, false);
  assert.equal((no as { reason: string }).reason, 'seller-not-verified');
});

test('requests from buyers who are at least person verified are shown when it is on', () => {
  assert.equal(buyerVisible({ enabled: true, level: 'registered' }), false);
  assert.equal(buyerVisible({ enabled: true, level: 'person_verified' }), true);
  assert.equal(buyerVisible({ enabled: false, level: 'registered' }), true);
});
