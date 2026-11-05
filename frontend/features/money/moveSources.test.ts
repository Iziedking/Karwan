import assert from 'node:assert/strict';
import test from 'node:test';
import { addSources, arrivesIn, readyIn, topUpSources } from './moveSources';

/// The one money sheet's sources (view 51).
///
///   npx tsx --test features/money/moveSources.test.ts

const networks = [
  { key: 'sepolia' as const, amount: 12.5 },
  { key: 'baseSepolia' as const, amount: 40 },
  { key: 'arbitrumSepolia' as const, amount: 0 },
];

test('richestNetworkFirst', () => {
  const out = addSources({ account: 'wallet', walletConnected: true, networks, pool: 0 });
  assert.deepEqual(out.map((s) => (s.kind === 'network' ? s.chain : s.kind)), ['baseSepolia', 'sepolia', 'exchange']);
});

test('emptyNetworksDropped', () => {
  const out = addSources({ account: 'wallet', walletConnected: true, networks, pool: 0 });
  assert.equal(out.some((s) => s.kind === 'network' && s.chain === 'arbitrumSepolia'), false);
});

test('a wallet account with a Transfer balance sees it after its networks', () => {
  const out = addSources({ account: 'wallet', walletConnected: true, networks, pool: 105.54 });
  assert.deepEqual(out.map((s) => s.kind), ['network', 'network', 'pool', 'exchange']);
});

test('emailAccountGetsWalletCardsNoPool', () => {
  const out = addSources({ account: 'email', walletConnected: true, networks, pool: 105.54 });
  assert.deepEqual(out.map((s) => s.kind), ['network', 'network', 'exchange']);
});

test('noWalletMeansExchangeOnly', () => {
  assert.deepEqual(addSources({ account: 'email', walletConnected: false, networks, pool: 0 }), [{ kind: 'exchange' }]);
});

test('topping up an agent starts from the balance, and never offers the exchange', () => {
  const out = topUpSources({ account: 'wallet', walletConnected: true, networks, pool: 5, balance: 4021.29 });
  assert.deepEqual(out.map((s) => s.kind), ['balance', 'pool', 'network', 'network']);
});

test('readyInFollowsCircleTable', () => {
  assert.equal(readyIn('baseSepolia'), 'about15Minutes');
  assert.equal(readyIn('sepolia'), 'about15Minutes');
  assert.equal(readyIn('avalancheFuji'), 'seconds');
  assert.equal(readyIn('arc'), 'seconds');
});

test('a top-up from Ethereum takes about 20 seconds, the rest seconds', () => {
  assert.equal(arrivesIn('sepolia'), 'twentySeconds');
  assert.equal(arrivesIn('baseSepolia'), 'seconds');
});
