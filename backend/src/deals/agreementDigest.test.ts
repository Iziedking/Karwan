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

test('high-signal identity policy changes the accepted agreement digest', () => {
  const highSignal = {
    ...base,
    verificationPolicy: 'high_signal' as const,
    verificationSubject: 'seller' as const,
  };
  assert.notEqual(agreementDigest(base), agreementDigest(highSignal));
  assert.notEqual(
    agreementDigest(highSignal),
    agreementDigest({ ...highSignal, verificationSubject: 'both' }),
  );
});

test('standard verification preserves the legacy agreement digest', () => {
  assert.equal(
    agreementDigest(base),
    agreementDigest({ ...base, verificationPolicy: 'standard', verificationSubject: 'seller' }),
  );
});

test('an agreed check window joins the digest only when set', () => {
  assert.equal(agreementDigest({ ...base, reviewWindowDays: undefined }), agreementDigest(base));
  assert.notEqual(agreementDigest({ ...base, reviewWindowDays: 3 }), agreementDigest(base));
  assert.notEqual(agreementDigest({ ...base, reviewWindowDays: 3 }), agreementDigest({ ...base, reviewWindowDays: 7 }));
});

test('a one-milestone deal digests as a single 100% part', () => {
  const base = { buyer: '0x1', seller: '0x2', dealAmountUsdc: '100', terms: 't' };
  assert.equal(
    agreementDigest({ ...base, firstReleasePct: 100 }),
    agreementDigest({ ...base, firstReleasePct: 100, milestonePcts: [100] }),
  );
});
