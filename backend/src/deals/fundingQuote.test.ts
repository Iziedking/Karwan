import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectDealFundingQuote, fundingAuthorizationMatches } from './fundingQuote.js';

const JOB_ID = `0x${'1'.repeat(64)}`;

test('computes the exact buyer and seller halves in six-decimal USDC units', () => {
  const quote = buildDirectDealFundingQuote({
    jobId: JOB_ID,
    dealAmountUsdc: '100',
    feeBps: 150,
    quotedAt: 123,
  });

  assert.equal(quote.dealAmountUsdc, '100');
  assert.equal(quote.buyerFeeUsdc, '0.75');
  assert.equal(quote.sellerFeeUsdc, '0.75');
  assert.equal(quote.feeTotalUsdc, '1.5');
  assert.equal(quote.fundedAmountUsdc, '100.75');
  assert.equal(quote.sellerNetUsdc, '99.25');
  assert.equal(quote.quotedAt, 123);
});

test('uses integer rounding consistently when a fee cannot split evenly', () => {
  const quote = buildDirectDealFundingQuote({
    jobId: JOB_ID,
    dealAmountUsdc: '0.0001',
    feeBps: 150,
  });

  assert.equal(quote.feeTotalUsdc, '0.000001');
  assert.equal(quote.buyerFeeUsdc, '0');
  assert.equal(quote.sellerFeeUsdc, '0.000001');
  assert.equal(quote.fundedAmountUsdc, '0.0001');
  assert.equal(quote.sellerNetUsdc, '0.000099');
});

test('fingerprint changes with economic terms but not quote time', () => {
  const first = buildDirectDealFundingQuote({
    jobId: JOB_ID,
    dealAmountUsdc: '42',
    feeBps: 150,
    quotedAt: 1,
  });
  const later = buildDirectDealFundingQuote({
    jobId: JOB_ID,
    dealAmountUsdc: '42',
    feeBps: 150,
    quotedAt: 2,
  });
  const changed = buildDirectDealFundingQuote({
    jobId: JOB_ID,
    dealAmountUsdc: '42',
    feeBps: 175,
    quotedAt: 2,
  });

  assert.equal(first.quoteFingerprint, later.quoteFingerprint);
  assert.notEqual(first.quoteFingerprint, changed.quoteFingerprint);
});

test('requires an exact fee, fingerprint, and funded total authorization', () => {
  const quote = buildDirectDealFundingQuote({
    jobId: JOB_ID,
    dealAmountUsdc: '100',
    feeBps: 150,
  });
  const authorization = {
    expectedFeeBps: quote.feeBps,
    maxFundedAmountUsdc: quote.fundedAmountUsdc,
    quoteFingerprint: quote.quoteFingerprint,
  };

  assert.equal(fundingAuthorizationMatches(quote, authorization), true);
  assert.equal(
    fundingAuthorizationMatches(quote, { ...authorization, expectedFeeBps: 151 }),
    false,
  );
  assert.equal(
    fundingAuthorizationMatches(quote, { ...authorization, maxFundedAmountUsdc: '100.74' }),
    false,
  );
  assert.equal(
    fundingAuthorizationMatches(quote, {
      ...authorization,
      quoteFingerprint: `0x${'00'.repeat(32)}`,
    }),
    false,
  );
});
