import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('./WalletsPanel.tsx', import.meta.url), 'utf8');

test('the testnet faucet is offered on testnet only, on every row', () => {
  // One place renders the faucet button, and it checks the network first.
  assert.equal(panel.match(/<FaucetButton/g)?.length, 1);
  assert.match(panel, /const faucet = \(target[^]*?ARC_NETWORK !== 'testnet'\) return undefined/);
});

test('a wallet row fits a phone: two lines, nothing cut, a 44px copy target, no browser tooltip', () => {
  assert.match(panel, /data-wallet-row/);
  // The row's own `title` prop is its name; a browser tooltip would be any other title.
  assert.doesNotMatch(panel, /title=\{(?!wp\.rows\.)/);
  assert.doesNotMatch(panel, /text-\[13px\]/);
  assert.match(panel, /min-h-11 min-w-11/);
  assert.match(panel, /walletAmount\(/);
  assert.match(panel, /wp\.unavailable/);
});

test('a money unit never drops below 14px, at any amount size', () => {
  const money = readFileSync(new URL('../../../shared/components/Money.tsx', import.meta.url), 'utf8');
  assert.match(money, /text-\[max\(14px,0\.45em\)\]/);
});
