import assert from 'node:assert/strict';
import test from 'node:test';
import { ownedBalance } from './ownedBalance';

test('the balance is one balance on Arc: the wallet and the agents, never other networks', () => {
  const owned = ownedBalance({ wallet: 292.1, pool: 0, buyer: 441.32, seller: 316.51 });
  assert.equal(owned.total?.toFixed(2), '1049.93');
  assert.deepEqual(
    { wallet: owned.wallet.toFixed(2), agents: owned.agents.toFixed(2) },
    { wallet: '292.10', agents: '757.83' },
  );
  assert.equal('otherChains' in owned, false);
});

test('a Gateway balance counts as wallet money, and agents not set up count as zero', () => {
  const owned = ownedBalance({ wallet: 10, pool: 5, buyer: null, seller: null });
  assert.equal(owned.total, 15);
  assert.equal(owned.wallet, 15);
  assert.equal(owned.agents, 0);
});

test('no total until the wallet itself has loaded', () => {
  assert.equal(ownedBalance({ wallet: null, pool: 0, buyer: 1, seller: 1 }).total, null);
});
