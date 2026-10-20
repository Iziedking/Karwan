import assert from 'node:assert/strict';
import test from 'node:test';
import { addOptions, withdrawOptions } from './plainSteps';
import { plainMoneyCopy } from '@/shared/i18n/messages/plainMoney';

/// Add and withdraw in plain steps (view 19, Money board): one question, the
/// ways that work for this account, and nothing named after a protocol.
///
///   npx tsx --test features/deposit/plainSteps.test.ts

const ids = (o: ReadonlyArray<{ id: string; soon?: true }>) => o.map((x) => `${x.id}${x.soon ? ':soon' : ''}`);

test('an email account adds with test USDC (testnet), its Karwan address, or card later', () => {
  assert.deepEqual(ids(addOptions('email', 'testnet')), ['faucet', 'address', 'card:soon']);
  assert.deepEqual(ids(addOptions('email', 'mainnet')), ['address', 'card:soon']);
});

test('a wallet account moves USDC from its wallet, sends from an exchange, or takes test USDC', () => {
  assert.deepEqual(ids(addOptions('wallet', 'testnet')), ['fromWallet', 'fromExchange', 'faucet']);
  assert.deepEqual(ids(addOptions('wallet', 'mainnet')), ['fromWallet', 'fromExchange']);
});

test('each way in opens the panel that already does it', () => {
  const rail = (account: 'email' | 'wallet', id: string) => addOptions(account, 'testnet').find((o) => o.id === id)?.opens;
  assert.deepEqual(rail('email', 'address'), { rail: 'direct' });
  assert.deepEqual(rail('wallet', 'fromWallet'), { rail: 'cctp' });
  assert.deepEqual(rail('email', 'faucet'), { href: '/profile/wallets' });
  assert.deepEqual(rail('wallet', 'fromExchange'), { panel: 'exchange' });
});

test('withdraw: to your own wallet, to someone on Karwan, or a bank later', () => {
  for (const account of ['email', 'wallet'] as const) {
    assert.deepEqual(ids(withdrawOptions(account)), ['ownWallet', 'someone', 'bank:soon']);
  }
  assert.deepEqual(withdrawOptions('email')[0]!.opens, { rail: 'cctp' });
  assert.deepEqual(withdrawOptions('wallet')[1]!.opens, { href: '/send' });
});

test('no protocol names in any of the words', () => {
  for (const copy of Object.values(plainMoneyCopy)) {
    assert.doesNotMatch(JSON.stringify(copy), /CCTP|Gateway|bridge|Bridge|EIP|App Kit/);
  }
});
