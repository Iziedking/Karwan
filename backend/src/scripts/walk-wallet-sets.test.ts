import assert from 'node:assert/strict';
import test from 'node:test';
import { walkSetsToMake } from './walk-wallet-sets.js';

const TEST_KEY = 'TEST_API_KEY:abc:def';

test('the walk makes only the wallet sets it is missing', () => {
  assert.deepEqual(walkSetsToMake({ apiKey: TEST_KEY, nodeEnv: 'development' }).map((s) => s.name), [
    'CIRCLE_WALLET_SET_ID',
    'CIRCLE_PAYLINK_WALLET_SET_ID',
  ]);
  assert.deepEqual(walkSetsToMake({ apiKey: TEST_KEY, nodeEnv: 'development', accountSet: 'a' }).map((s) => s.name), [
    'CIRCLE_PAYLINK_WALLET_SET_ID',
  ]);
  assert.deepEqual(walkSetsToMake({ apiKey: TEST_KEY, nodeEnv: 'development', accountSet: 'a', paylinkSet: 'b' }), []);
});

test('the walk refuses a live key and a production environment', () => {
  assert.throws(() => walkSetsToMake({ apiKey: 'LIVE_API_KEY:abc:def', nodeEnv: 'development' }), /TEST key/);
  assert.throws(() => walkSetsToMake({ apiKey: undefined, nodeEnv: 'development' }), /TEST key/);
  assert.throws(() => walkSetsToMake({ apiKey: TEST_KEY, nodeEnv: 'production' }), /production/);
});
