import assert from 'node:assert/strict';
import test from 'node:test';
import { sendAvailable, sendShortfall, topUpWithFees } from './sendFromWhole';

///   npx tsx --test features/money/sendFromWhole.test.ts

test('a send the wallet covers needs nothing from the pool', () => {
  assert.equal(sendShortfall(100, 109.51), 0);
  assert.equal(sendShortfall(109.51, 109.51), 0);
  assert.equal(sendShortfall(5, null), 0);
});

test('a bigger send takes the shortfall, rounded up to the cent', () => {
  assert.equal(sendShortfall(140, 109.51), 30.49);
  assert.equal(sendShortfall(109.515, 109.51), 0.01);
});

test('a send can reach the wallet and the pool together once the pool is read', () => {
  assert.equal(sendAvailable(109.51, 50, true), 159.51);
  assert.equal(sendAvailable(109.51, 50, false), 109.51);
  assert.equal(sendAvailable(null, 50, true), null);
});

test('the top-up adds the forwarder fee so the whole shortfall lands', () => {
  const fees = [
    { type: 'forwarder', amount: '0.12' },
    { type: 'gasFee', amount: '0.002' },
  ];
  assert.equal(topUpWithFees(30.49, fees), 30.61);
  assert.equal(topUpWithFees(5, []), 5);
  assert.equal(topUpWithFees(0.1, [{ type: 'forwarder', amount: '0.000001' }]), 0.11);
});
