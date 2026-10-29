import assert from 'node:assert/strict';
import { test } from 'node:test';
import { negotiationSummary, outsideMandate, recordAgreement, resetNegotiationMeasures, summarise } from './negotiationMeasures.js';

/// Deals, exchanges, agreed against usual, and the zero that must stay zero
/// (view 41, measures 6).
///
///   npx tsx --test src/agents/negotiationMeasures.test.ts

test('an agreement outside a mandate fails the check, inside it passes', () => {
  assert.equal(outsideMandate({ jobId: 'a', side: 'seller', agreedUsdc: 79, floorUsdc: 80, exchanges: 2, at: 0 }), true);
  assert.equal(outsideMandate({ jobId: 'a', side: 'seller', agreedUsdc: 80, floorUsdc: 80, exchanges: 2, at: 0 }), false);
  assert.equal(outsideMandate({ jobId: 'a', side: 'buyer', agreedUsdc: 121, capUsdc: 120, exchanges: 2, at: 0 }), true);
  assert.equal(outsideMandate({ jobId: 'a', side: 'buyer', agreedUsdc: 120, capUsdc: 120, exchanges: 2, at: 0 }), false);
});

test('the summary counts deals, averages exchanges and reads agreed against usual', () => {
  const s = summarise([
    { jobId: 'a', side: 'seller', agreedUsdc: 90, floorUsdc: 80, usualUsdc: 100, exchanges: 2, at: 0 },
    { jobId: 'b', side: 'seller', agreedUsdc: 110, floorUsdc: 80, usualUsdc: 100, exchanges: 4, at: 0 },
    { jobId: 'c', side: 'buyer', agreedUsdc: 50, capUsdc: 60, exchanges: 0, at: 0 },
  ]);
  assert.equal(s.deals, 3);
  assert.equal(s.outsideMandate, 0);
  assert.equal(s.exchangesAvg, 2);
  assert.equal(s.agreedVsUsual, 1);
  assert.equal(s.recent.length, 3);
});

test('recording keeps the last agreements and flags one outside the mandate', () => {
  resetNegotiationMeasures();
  recordAgreement({ jobId: 'a', side: 'seller', agreedUsdc: 95, floorUsdc: 90, exchanges: 1, at: 1 });
  recordAgreement({ jobId: 'b', side: 'seller', agreedUsdc: 70, floorUsdc: 90, exchanges: 5, at: 2 });
  const s = negotiationSummary();
  assert.equal(s.deals, 2);
  assert.equal(s.outsideMandate, 1);
  assert.equal(s.recent[1]?.outsideMandate, true);
  resetNegotiationMeasures();
});
