import assert from 'node:assert/strict';
import test from 'node:test';
import { checkInvoice, invoiceFingerprint, type ExtractedInvoice } from './invoice.js';

const now = Date.UTC(2026, 9, 12);
const good: ExtractedInvoice = {
  issuer: 'Ada Builds Ltd',
  counterparty: 'Tunde Stores',
  amount: 250,
  currency: 'USD',
  date: '2026-03-14',
  number: 'INV-0042',
};

test('a complete invoice passes with a stable fingerprint', () => {
  const r = checkInvoice(good, { displayName: 'Ada Builds' }, now);
  assert.equal(r.ok, true);
  assert.equal((r as { fingerprint: string }).fingerprint, invoiceFingerprint(good));
});

test('the same invoice with different spacing and case has the same fingerprint', () => {
  const messy = { ...good, issuer: '  ada   builds LTD ', counterparty: 'TUNDE stores', number: 'inv-0042' };
  assert.equal(invoiceFingerprint(messy), invoiceFingerprint(good));
});

test('a different amount is a different invoice', () => {
  assert.notEqual(invoiceFingerprint({ ...good, amount: 251 }), invoiceFingerprint(good));
});

test('a missing amount, date or counterparty fails', () => {
  for (const missing of ['amount', 'date', 'counterparty'] as const) {
    const r = checkInvoice({ ...good, [missing]: undefined }, { displayName: 'Ada Builds' }, now);
    assert.deepEqual(r, { ok: false, reason: 'missing_fields' }, missing);
  }
});

test('a future date fails, and so does one older than three years', () => {
  assert.deepEqual(checkInvoice({ ...good, date: '2026-12-01' }, { displayName: 'Ada Builds' }, now), { ok: false, reason: 'future_date' });
  assert.deepEqual(checkInvoice({ ...good, date: '2023-01-01' }, { displayName: 'Ada Builds' }, now), { ok: false, reason: 'too_old' });
  assert.deepEqual(checkInvoice({ ...good, date: 'not a date' }, { displayName: 'Ada Builds' }, now), { ok: false, reason: 'missing_fields' });
});

test('an issuer that is not the account fails; Ltd, Limited and punctuation are ignored', () => {
  assert.deepEqual(checkInvoice(good, { displayName: 'Kemi Designs' }, now), { ok: false, reason: 'issuer_mismatch' });
  assert.equal(checkInvoice({ ...good, issuer: 'Ada Builds Limited.' }, { displayName: 'Ada Builds' }, now).ok, true);
});

test('an issuer naming the account as the counterparty fails, so a received invoice cannot be claimed as work done', () => {
  const received = { ...good, issuer: 'Tunde Stores', counterparty: 'Ada Builds' };
  assert.deepEqual(checkInvoice(received, { displayName: 'Ada Builds' }, now), { ok: false, reason: 'issuer_mismatch' });
});
