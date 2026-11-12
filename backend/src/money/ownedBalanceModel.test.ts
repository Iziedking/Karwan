import test from 'node:test';
import assert from 'node:assert/strict';
import { holdsPool, ownedBalance, ownedInLocal } from './ownedBalanceModel.js';

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

test('only a wallet account holds a Transfer balance; an email account never counts one', () => {
  assert.equal(holdsPool('web3'), true);
  assert.equal(holdsPool('circle'), false);
});

test('the parts are the ones Money names: cents rounded down, never adding to more than the balance', () => {
  // Live, 12 Nov 2026: Money read "ready" from 1,025.968 as 1,025.96, the server said 1,025.97.
  const owned = ownedBalance({ arcWallet: 1025.968115, pooled: 0, buyer: 457.493115, seller: 43.1008, staked: 500 });
  assert.equal(owned.ready, 1025.96);
  assert.equal(owned.withAgents, 500.59);
  assert.equal(owned.exact, 1526.56203);
  assert.ok(owned.ready + owned.withAgents <= owned.exact);
});

test('the balance and its two parts are given in the currency the person reads, as their screens show them', () => {
  const owned = ownedBalance({ arcWallet: 1025.968115, pooled: 0, buyer: 457.493115, seller: 43.1008, staked: 500 });
  const rates = { rates: { NGN: 1350.423654 }, updatedAt: 1, source: 'test' } as never;
  const said = ownedInLocal(owned, 'NGN', rates);
  assert.deepEqual(said && { currency: said.currency, total: said.total, ready: said.ready, withAgents: said.withAgents }, {
    currency: 'NGN',
    total: '2061505',
    ready: '1385481',
    withAgents: '676009',
  });
  assert.equal(ownedInLocal(owned, 'USDC', rates), null);
  assert.equal(ownedInLocal(owned, undefined, rates), null);
});
