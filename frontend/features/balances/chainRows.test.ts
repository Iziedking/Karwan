import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arcIncludingPool, chainsSummaryLabel } from './chainRows';

const copy = {
  zeroChainsTemplate: 'No USDC on {n} chains',
  fundedChainsTemplate: 'USDC on {n} of {total} chains',
  fundedChainOne: 'USDC on 1 of {total} chains',
};

test('Arc on your own wallet counts the top-up balance, as the summary does', () => {
  assert.equal(arcIncludingPool(459.1, 50), 509.1);
  assert.equal(arcIncludingPool(null, 50), null, 'nothing is shown before Arc loads');
  assert.equal(arcIncludingPool(0, 0), 0);
});

test('the card adds the top-up balance only on your own tab', () => {
  const card = readFileSync(new URL('./components/BalancesCard.tsx', import.meta.url), 'utf8');
  assert.match(card, /view === 'you' && key === 'arc'/);
  assert.match(card, /chainsSummaryLabel\(/);
});

test('every tab folds its chains into one line, money or not', () => {
  assert.equal(chainsSummaryLabel(0, 8, copy), 'No USDC on 8 chains');
  assert.equal(chainsSummaryLabel(1, 8, copy), 'USDC on 1 of 8 chains');
  assert.equal(chainsSummaryLabel(3, 8, copy), 'USDC on 3 of 8 chains');
});
