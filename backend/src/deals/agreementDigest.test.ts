import assert from 'node:assert/strict';
import test from 'node:test';
import { agreementDigest } from './agreementDigest.js';

const base = {
  buyer: '0x0000000000000000000000000000000000000001',
  seller: '0x0000000000000000000000000000000000000002',
  dealAmountUsdc: '100.00',
  firstReleasePct: 30,
  terms: 'Build the agreed delivery',
};

test('agreement digest is stable across object key order and address casing', () => {
  const left = agreementDigest({
    ...base,
    buyer: base.buyer.toUpperCase(),
    counterpartyCompany: { region: 'NG', name: 'Acme' },
  });
  const right = agreementDigest({
    ...base,
    counterpartyCompany: { name: 'Acme', region: 'NG' },
  });
  assert.equal(left, right);
});

test('agreement digest changes when a commercial field changes', () => {
  const original = agreementDigest(base);
  assert.notEqual(original, agreementDigest({ ...base, seller: '0x0000000000000000000000000000000000000003' }));
  assert.notEqual(original, agreementDigest({ ...base, dealAmountUsdc: '101.00' }));
  assert.notEqual(original, agreementDigest({ ...base, firstReleasePct: 40 }));
  assert.notEqual(original, agreementDigest({ ...base, deadlineUnix: 1_900_000_000 }));
  assert.notEqual(original, agreementDigest({ ...base, paymentTerms: 'net30' }));
});

test('required delivery evidence changes the accepted agreement digest', () => {
  const required = { ...base, evidenceRequired: true };
  assert.notEqual(agreementDigest(base), agreementDigest(required));
});
