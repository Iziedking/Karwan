import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptRefusal, advanceShortfall, offerRefusal } from './factoringFunding.js';

/// A financing offer goes out only when the financier's wallet holds the
/// advance, and accepting checks it again before anything touches the chain.
///
///   npx tsx --test src/routes/factoringFunding.test.ts

const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));

test('the shortfall is what the wallet is missing, and nothing when it is covered', () => {
  assert.equal(advanceShortfall(usdc(500), usdc(880)), usdc(380));
  assert.equal(advanceShortfall(usdc(880), usdc(880)), 0n);
  assert.equal(advanceShortfall(usdc(1000), usdc(880)), 0n);
});

test('an offer short by 380 USDC is refused with the amount to add', () => {
  assert.deepEqual(offerRefusal(usdc(500), usdc(880)), {
    error: 'advance not funded',
    code: 'ADVANCE_NOT_FUNDED',
    shortfallUsdc: '380',
  });
  assert.equal(offerRefusal(usdc(880), usdc(880)), null);
});

test('a shortfall keeps cents', () => {
  assert.equal(offerRefusal(usdc(310.972208), usdc(815))?.shortfallUsdc, '504.027792');
});

test('accepting an offer the financier can no longer cover is refused before the chain', () => {
  assert.deepEqual(acceptRefusal(usdc(310.97), usdc(880)), {
    error: 'The financier has not added the money for this offer yet.',
    code: 'FINANCIER_NOT_FUNDED',
    shortfallUsdc: '569.03',
  });
  assert.equal(acceptRefusal(usdc(900), usdc(880)), null);
});
