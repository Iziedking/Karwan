import assert from 'node:assert/strict';
import test from 'node:test';
import { dealPanel, personPanel, transferPanel } from './recordView.js';

const SECRET_KEYS = ['walletId', 'entitySecret', 'circleWalletId', 'privateKey', 'email', 'phone', 'bankAccount', 'termsHash', 'deliveryAssessment', 'apiKey', 'buyerAgentWalletId', 'sellerAgentWalletId', 'idempotencyKey', 'providerId'];
const SECRET_VALUES = ['ws-123', 'es-secret', 'cw-999', '0xprivate', 'ada@example.com', '+2348000000000', '0123456789', 'th-abc', 'looks fake', 'sk_live_1', 'prov-1'];

function leaks(panel: unknown): string[] {
  const text = JSON.stringify(panel);
  return [...SECRET_KEYS.filter((k) => text.includes(`"${k}"`)), ...SECRET_VALUES.filter((v) => text.includes(v))];
}

const profile = {
  address: '0xabc', displayName: 'Chidi Okafor', handle: 'chidi', email: 'ada@example.com', phone: '+2348000000000',
  walletId: 'ws-123', entitySecret: 'es-secret', apiKey: 'sk_live_1', bankAccount: '0123456789',
};

const deal = {
  jobId: `0x${'d1'.repeat(32)}`, buyer: '0xabc', seller: '0xdef', dealAmountUsdc: '50', terms: 'four shirts',
  buyerAgentWalletId: 'ws-123', sellerAgentWalletId: 'cw-999', termsHash: 'th-abc', deliveryAssessment: 'looks fake',
  privateKey: '0xprivate', acceptedAt: 1, delivered: true, deliveredAt: 2, createdAt: 1, updatedAt: 3,
  settledWorth: { '0xabc': { currency: 'NGN', amount: '77400' } },
};

const movement = {
  reference: 'KR-7Q2M', kind: 'payout', state: 'failed', amountMicros: '52100000', initiatedBy: '0xabc', summary: 'Payout to bank',
  failureCode: 'partner_rejected', idempotencyKey: 'idem', worth: { '0xabc': { currency: 'NGN', amount: '80000' } },
  legs: [{ walletId: 'ws-123', providerId: 'prov-1', idempotencyKey: 'idem' }], createdAt: 1, updatedAt: 4,
};

test('nothing outside the allowlist survives', () => {
  const p = personPanel({ profile, verified: true, network: 'testnet', earlierCases: [{ ref: 'KT-1001', kind: 'other', state: 'solved', createdAt: 1 }] });
  const d = dealPanel(deal, { viewer: '0xabc', names: { '0xdef': { name: 'Ada Bello', handle: 'ada' } } });
  const t = transferPanel(movement, { viewer: '0xabc' });
  assert.deepEqual(leaks(p), []);
  assert.deepEqual(leaks(d), []);
  assert.deepEqual(leaks(t), []);
  assert.deepEqual(Object.keys(p).sort(), ['earlierCases', 'handle', 'name', 'network', 'verified']);
  assert.deepEqual(Object.keys(d).sort(), ['amountUsdc', 'kind', 'nextStep', 'otherSide', 'reference', 'state', 'updatedAt', 'worth']);
  assert.deepEqual(Object.keys(t).sort(), ['amountUsdc', 'failedReason', 'kind', 'reference', 'state', 'summary', 'updatedAt', 'worth']);
});

test('the panels say what a teammate needs', () => {
  const d = dealPanel(deal, { viewer: '0xabc', names: { '0xdef': { name: 'Ada Bello', handle: 'ada' } } });
  assert.equal(d.kind, 'deal');
  assert.equal(d.amountUsdc, '50');
  assert.deepEqual(d.worth, { currency: 'NGN', amount: '77400' });
  assert.deepEqual(d.otherSide, { name: 'Ada Bello', handle: 'ada' });
  assert.equal(d.state, 'delivered');
  const t = transferPanel(movement, { viewer: '0xabc' });
  assert.equal(t.amountUsdc, '52.1');
  assert.equal(t.state, 'failed');
  assert.equal(t.failedReason, 'partner_rejected');
});
