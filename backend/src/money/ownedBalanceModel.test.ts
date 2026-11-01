import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedBalance } from './ownedBalanceModel.js';

test('the total is one balance on Arc: wallet with its Gateway part and agents, never other networks or the stake', () => {
  const owned = ownedBalance({
    arcWallet: 710.97,
    pooled: 121.35,
    buyer: 215.17,
    seller: 482.23,
    staked: 7050,
  });
  assert.equal(owned.wallet, 832.32);
  assert.equal(owned.agents, 697.4);
  assert.equal(owned.total, 1529.72);
  assert.equal(owned.staked, 7050);
  assert.equal(owned.partial, false);
  assert.equal('otherChains' in owned, false);
});

test('a source that could not be read counts as zero and marks the answer partial', () => {
  const owned = ownedBalance({ arcWallet: 10, pooled: null, buyer: 5, seller: null, staked: 0 });
  assert.equal(owned.total, 15);
  assert.equal(owned.partial, true);
});
