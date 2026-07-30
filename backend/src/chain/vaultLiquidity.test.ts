import { test } from 'node:test';
import assert from 'node:assert/strict';

/// Base-unit conversion for the claim-liquidity numbers.
///
/// Everything downstream of `readVaultLiquidity` is money arithmetic on strings
/// that came back as decimal USDC: the orchestrator's buffer, the shortfall the
/// admin panel redeems, the amount deposited back into the vault. A conversion
/// that is wrong by a factor of a million does not look wrong, it looks like a
/// vault that needs a great deal more funding than it does.
///
///   npx tsx --test src/chain/vaultLiquidity.test.ts

const { toBaseUnits } = await import('./vaultLiquidity.js');

test('whole numbers convert at six decimals', () => {
  assert.equal(toBaseUnits('0'), 0n);
  assert.equal(toBaseUnits('1'), 1_000_000n);
  assert.equal(toBaseUnits('2347'), 2_347_000_000n);
});

test('fractional amounts keep every cent', () => {
  // 0.5 must not become 5, which is what reading the fraction as an integer
  // without padding would do.
  assert.equal(toBaseUnits('0.5'), 500_000n);
  assert.equal(toBaseUnits('1.25'), 1_250_000n);
  assert.equal(toBaseUnits('3972.254292'), 3_972_254_292n);
});

test('a short fraction is padded, not left-aligned wrong', () => {
  // formatUnits emits '1.1', meaning 1.100000, not 1.000001. Getting this
  // backwards understates a shortfall by a factor of 100,000.
  assert.equal(toBaseUnits('1.1'), 1_100_000n);
  assert.equal(toBaseUnits('1.01'), 1_010_000n);
});

test('more than six decimals truncates rather than throwing', () => {
  // The oracle carries 18 decimals. If a value ever reaches this with more
  // precision than USDC has, dropping the tail is right and crashing is not.
  assert.equal(toBaseUnits('1.1234567891'), 1_123_456n);
});

test('it round-trips whatever formatUnits produced', async () => {
  const { formatUnits } = await import('viem');
  for (const v of [0n, 1n, 999_999n, 1_000_000n, 2_347_000_000n, 3_924_000_001n]) {
    assert.equal(toBaseUnits(formatUnits(v, 6)), v, `round trip failed for ${v}`);
  }
});
