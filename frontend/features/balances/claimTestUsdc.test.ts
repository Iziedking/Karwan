import assert from 'node:assert/strict';
import test from 'node:test';
import { claimTestUsdc } from './claimTestUsdc';

function deps(over: Partial<Parameters<typeof claimTestUsdc>[0]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    d: {
      request: async () => { calls.push('request'); },
      copy: async () => { calls.push('copy'); },
      openFaucet: () => { calls.push('open'); },
      ...over,
    },
  };
}

test('test USDC is sent straight to the wallet when the faucet answers', async () => {
  const { calls, d } = deps();
  assert.equal(await claimTestUsdc(d), 'sent');
  assert.deepEqual(calls, ['request']);
});

test('when the faucet refuses, the address is copied and Circle\'s faucet opens', async () => {
  const { calls, d } = deps({ request: async () => { calls.push('request'); throw new Error('limit'); } });
  assert.equal(await claimTestUsdc(d), 'copied');
  assert.deepEqual(calls, ['request', 'copy', 'open']);
});

test('when copying fails too, Circle\'s faucet still opens and the address is shown', async () => {
  const { calls, d } = deps({
    request: async () => { calls.push('request'); throw new Error('limit'); },
    copy: async () => { calls.push('copy'); throw new Error('no clipboard'); },
  });
  assert.equal(await claimTestUsdc(d), 'manual');
  assert.deepEqual(calls, ['request', 'copy', 'open']);
});
