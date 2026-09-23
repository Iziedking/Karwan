import assert from 'node:assert/strict';
import test from 'node:test';
import { checkChain, mustStop } from './networkGuard.js';

test('the configured chain passes', async () => {
  const r = await checkChain(async () => 5042, 5042);
  assert.equal(r.status, 'match');
  assert.equal(mustStop(r, true), false);
});

test('a mainnet config on a testnet RPC stops production', async () => {
  const r = await checkChain(async () => 5042002, 5042);
  assert.deepEqual(r, { status: 'mismatch', chainId: 5042002, expected: 5042 });
  assert.equal(mustStop(r, true), true);
  assert.equal(mustStop(r, false), false, 'development only warns');
});

test('an unreachable RPC never stops the process', async () => {
  const r = await checkChain(async () => {
    throw new Error('ECONNREFUSED');
  }, 5042);
  assert.equal(r.status, 'unreachable');
  assert.equal(mustStop(r, true), false);
});
