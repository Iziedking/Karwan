import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldResumePendingRefund } from './pendingRefund.js';

const buyer = '0xa045e8104bc066fff5bfc673abf354871edc03c5';
const stuck = {
  deal: { buyer, buyerAgentWalletId: 'wallet-1', escrowVersion: undefined, cancelledAt: undefined, settledAt: undefined },
  escrow: { disputed: true, wasAccepted: false, version: 'v2' },
  refund: { state: 'created' as const, initiatedBy: buyer },
};

test('a buyer cancel that disputed but never refunded a deal the seller never accepted is resumed', () => {
  assert.equal(shouldResumePendingRefund(stuck), true);
  assert.equal(shouldResumePendingRefund({ ...stuck, refund: { ...stuck.refund, state: 'needs_attention' } }), true);
});

test('nothing is resumed without the buyer having asked for the refund', () => {
  assert.equal(shouldResumePendingRefund({ ...stuck, refund: null }), false);
  assert.equal(shouldResumePendingRefund({ ...stuck, refund: { ...stuck.refund, initiatedBy: '0x0a5dcb155fa339d1f2670ef935d89a00379cc020' } }), false);
});

test('a refund already sent, finished or cancelled is left alone', () => {
  for (const state of ['submitted', 'verifying', 'completed', 'cancelled'] as const) {
    assert.equal(shouldResumePendingRefund({ ...stuck, refund: { ...stuck.refund, state } }), false, state);
  }
});

test('a real dispute after the seller accepted stays with the dispute process', () => {
  assert.equal(shouldResumePendingRefund({ ...stuck, escrow: { ...stuck.escrow, wasAccepted: true } }), false);
  assert.equal(shouldResumePendingRefund({ ...stuck, escrow: { ...stuck.escrow, disputed: false } }), false);
});

test('closed deals, v3 deals and deals without a buyer agent are left alone', () => {
  assert.equal(shouldResumePendingRefund({ ...stuck, deal: { ...stuck.deal, cancelledAt: 1 } }), false);
  assert.equal(shouldResumePendingRefund({ ...stuck, deal: { ...stuck.deal, settledAt: 1 } }), false);
  assert.equal(shouldResumePendingRefund({ ...stuck, escrow: { ...stuck.escrow, version: 'v3' } }), false);
  assert.equal(shouldResumePendingRefund({ ...stuck, deal: { ...stuck.deal, escrowVersion: 'v3' } }), false);
  assert.equal(shouldResumePendingRefund({ ...stuck, deal: { ...stuck.deal, buyerAgentWalletId: undefined } }), false);
});
