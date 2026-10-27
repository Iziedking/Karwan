import assert from 'node:assert/strict';
import test from 'node:test';
import { MULTICALL3FROM, sentTo } from './multicall3From.js';

const USDC = '0x3600000000000000000000000000000000000000';

test('a_direct_call_or_one_through_the_batcher_counts', () => {
  assert.equal(sentTo(USDC, USDC), true);
  assert.equal(sentTo('0x522fAf9A91c41c443c66765030741e4AaCe147D0', USDC), true);
  assert.equal(MULTICALL3FROM, '0x522faf9a91c41c443c66765030741e4aace147d0');
});

test('any_other_target_does_not', () => {
  assert.equal(sentTo(`0x${'12'.repeat(20)}`, USDC), false);
  assert.equal(sentTo(null, USDC), false);
  assert.equal(sentTo(undefined, USDC), false);
});
