import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVATION_RETRY_MS, unacceptedStep } from './unacceptedEscrow.js';

const ACCEPT_BY_SECS = 1_800_000_000;
const before = ACCEPT_BY_SECS * 1000 - 60_000;
const after = ACCEPT_BY_SECS * 1000 + 1_000;

const deal = (over: Record<string, unknown> = {}) => ({
  escrowVersion: 'suite' as const,
  escrowDealId: '0xabc',
  escrowTerms: { acceptBy: String(ACCEPT_BY_SECS) } as never,
  ...over,
});

test('a funded deal the seller never accepted is retried while the escrow allows it', () => {
  assert.equal(unacceptedStep(deal(), true, before), 'activate');
});

test('retries wait half an hour between tries', () => {
  assert.equal(unacceptedStep(deal({ activationRetriedAt: before - 60_000 }), true, before), null);
  assert.equal(unacceptedStep(deal({ activationRetriedAt: before - ACTIVATION_RETRY_MS }), true, before), 'activate');
});

test('once the accept window closes the money goes back to the buyer, whatever the last retry', () => {
  assert.equal(unacceptedStep(deal(), true, after), 'refund');
  assert.equal(unacceptedStep(deal({ activationRetriedAt: after - 1 }), true, after), 'refund');
});

test('nothing to do when the deal is accepted, cancelled, not funded on chain, or not on the escrow family', () => {
  assert.equal(unacceptedStep(deal({ acceptedAt: 1 }), true, after), null);
  assert.equal(unacceptedStep(deal({ cancelledAt: 1 }), true, after), null);
  assert.equal(unacceptedStep(deal(), false, after), null);
  assert.equal(unacceptedStep(deal({ escrowVersion: 'v3' }), true, after), null);
  assert.equal(unacceptedStep(deal({ escrowDealId: undefined }), true, after), null);
  assert.equal(unacceptedStep(deal({ escrowTerms: undefined }), true, after), null);
});
