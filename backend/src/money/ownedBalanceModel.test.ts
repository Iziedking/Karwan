import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNED_OTHER_CHAINS, ownedBalance } from './ownedBalanceModel.js';

test('the total is wallet with its pooled part, other chains and agents, and never the stake', () => {
  const owned = ownedBalance({
    arcWallet: 710.97,
    pooled: 121.35,
    otherChains: [25.63, 20.5, 14.41, 10.94, 20, 0, 0],
    buyer: 215.17,
    seller: 482.23,
    staked: 7050,
  });
  assert.equal(owned.wallet, 832.32);
  assert.equal(owned.otherChains, 91.48);
  assert.equal(owned.agents, 697.4);
  assert.equal(owned.total, 1621.2);
  assert.equal(owned.staked, 7050);
  assert.equal(owned.partial, false);
});

test('a source that could not be read counts as zero and marks the answer partial', () => {
  const owned = ownedBalance({ arcWallet: 10, pooled: null, otherChains: [null, 5], buyer: null, seller: null, staked: 0 });
  assert.equal(owned.total, 15);
  assert.equal(owned.partial, true);
});

test('the other chains are the seven the balance page counts', () => {
  assert.deepEqual([...OWNED_OTHER_CHAINS].sort(), [
    'arbitrumSepolia', 'avalancheFuji', 'baseSepolia', 'optimismSepolia', 'polygonAmoy', 'sepolia', 'unichainSepolia',
  ]);
});
