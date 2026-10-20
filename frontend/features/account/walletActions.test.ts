import assert from 'node:assert/strict';
import test from 'node:test';
import { walletActions } from './walletActions';

/// Each wallet on the balance page has its own actions, as button tiles
/// (owner, 20 Oct 2026): the one selected decides what you can do.
///
///   npx tsx --test features/account/walletActions.test.ts

const keys = (tab: Parameters<typeof walletActions>[0], account: 'email' | 'wallet' = 'email') =>
  walletActions(tab, account, 'testnet').map((a) => a.key);

test('your wallet: add, withdraw, send and payment request, with add first', () => {
  assert.deepEqual(keys('you'), ['add', 'withdraw', 'send', 'request']);
  const add = walletActions('you', 'email', 'testnet')[0]!;
  assert.equal(add.primary, true);
  assert.deepEqual(add.go, { href: '/bridge?direction=in' });
  assert.deepEqual(walletActions('you', 'email', 'testnet')[3]!.go, { href: '/request' });
});

test('the buying agent tops up from your wallet or moves money back', () => {
  assert.deepEqual(keys('buyer'), ['topUp', 'moveBack']);
  const [topUp, back] = walletActions('buyer', 'wallet', 'testnet');
  assert.deepEqual(topUp!.go, { move: 'topUp', agent: 'buyer' });
  assert.equal(topUp!.primary, true);
  assert.deepEqual(back!.go, { move: 'withdraw', agent: 'buyer' });
});

test('the selling agent moves earnings to your wallet first, then top up', () => {
  assert.deepEqual(keys('seller'), ['moveEarnings', 'topUp']);
  const [earnings, topUp] = walletActions('seller', 'email', 'mainnet');
  assert.deepEqual(earnings!.go, { move: 'withdraw', agent: 'seller' });
  assert.equal(earnings!.primary, true);
  assert.deepEqual(topUp!.go, { move: 'topUp', agent: 'seller' });
});

test('adding money says test USDC only on testnet, and how depends on the account', () => {
  const note = (account: 'email' | 'wallet', network: 'testnet' | 'mainnet') => walletActions('you', account, network)[0]!.note;
  assert.equal(note('email', 'testnet'), 'addEmailTestnet');
  assert.equal(note('wallet', 'testnet'), 'addWalletTestnet');
  assert.equal(note('email', 'mainnet'), 'addEmail');
  assert.equal(note('wallet', 'mainnet'), 'addWallet');
});
