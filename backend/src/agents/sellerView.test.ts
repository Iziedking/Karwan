import assert from 'node:assert/strict';
import test from 'node:test';
import { sellerViewOfRequest } from './sellerView.js';

const input = {
  jobId: '0xjob',
  buyer: '0xbuyer',
  budgetUsdc: '120',
  deadlineUnix: 2_000,
  termsHash: 'terms',
  keywords: ['backend'],
  brief: {
    briefText: 'Backend engineer',
    negotiationMaxIncreasePct: 25,
    trustedMatch: true,
    tradeLane: 'service' as const,
    counterpartyCompany: { sector: 'tech', region: 'Lagos' },
  },
};

test('a seller sees the request and its budget, never how far above it the buyer would go (view 35)', () => {
  const view = sellerViewOfRequest(input);
  assert.equal(view.budgetUsdc, '120');
  assert.equal(view.briefText, 'Backend engineer');
  assert.equal(view.trustedMatch, true);
  assert.equal(view.sourcingRegion, 'Lagos');
  assert.ok(!('negotiationMaxIncreasePct' in view), 'the leeway stays with the buyer');
});

test('a request with no brief still reads as a plain request', () => {
  const view = sellerViewOfRequest({ ...input, brief: undefined });
  assert.equal(view.tradeLane, 'service');
  assert.equal(view.trustedMatch, false);
});
