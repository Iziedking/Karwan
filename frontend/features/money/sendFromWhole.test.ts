import assert from 'node:assert/strict';
import test from 'node:test';
import { sendAvailable, sendShortfall } from './sendFromWhole';

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
