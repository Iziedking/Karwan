import assert from 'node:assert/strict';
import test from 'node:test';
import { ownedBalance } from './ownedBalance';

test('the balance is everything the account owns: wallet, other chains and agents', () => {
  const owned = ownedBalance({ wallet: 292.1, pool: 0, otherChains: 77.65, buyer: 441.32, seller: 316.51 });
  assert.equal(owned.total?.toFixed(2), '1127.58');
  assert.deepEqual(
    { wallet: owned.wallet.toFixed(2), otherChains: owned.otherChains.toFixed(2), agents: owned.agents.toFixed(2) },
    { wallet: '292.10', otherChains: '77.65', agents: '757.83' },
  );
});

test('a Gateway balance counts as wallet money, and agents not set up count as zero', () => {
  const owned = ownedBalance({ wallet: 10, pool: 5, otherChains: 0, buyer: null, seller: null });
  assert.equal(owned.total, 15);
  assert.equal(owned.wallet, 15);
  assert.equal(owned.agents, 0);
});

test('no total until the wallet itself has loaded', () => {
  assert.equal(ownedBalance({ wallet: null, pool: 0, otherChains: 3, buyer: 1, seller: 1 }).total, null);
});
