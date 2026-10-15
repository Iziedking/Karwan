import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arcIncludingPool, emptyChainsLabel } from './chainRows';

const copy = {
  zeroChainsTemplate: 'No USDC on {n} chains',
  zeroOtherChainsTemplate: 'No USDC on {n} other chains',
  zeroChainOne: 'No USDC on 1 chain',
  zeroOtherChainOne: 'No USDC on 1 other chain',
};

test('Arc on your own wallet counts the top-up balance, as the summary does', () => {
  assert.equal(arcIncludingPool(459.1, 50), 509.1);
  assert.equal(arcIncludingPool(null, 50), null, 'nothing is shown before Arc loads');
  assert.equal(arcIncludingPool(0, 0), 0);
});

test('one empty chain reads in the singular', () => {
  assert.equal(emptyChainsLabel(1, true, copy), 'No USDC on 1 other chain');
  assert.equal(emptyChainsLabel(1, false, copy), 'No USDC on 1 chain');
  assert.equal(emptyChainsLabel(3, true, copy), 'No USDC on 3 other chains');
  assert.equal(emptyChainsLabel(3, false, copy), 'No USDC on 3 chains');
});

test('the card adds the top-up balance only on your own tab', () => {
  const card = readFileSync(new URL('./components/BalancesCard.tsx', import.meta.url), 'utf8');
  assert.match(card, /view === 'you' && key === 'arc'/);
  assert.match(card, /emptyChainsLabel\(/);
});
