import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AttestationBand } from '@/core/api';
import { attestedDealsCopy } from '@/shared/i18n/messages/attestedDeals';
import { attestedPage, attestedRows } from './attestedDeals';

const copy = attestedDealsCopy.en;
const a = (id: string, date: string, role: 'buyer' | 'seller', amountBand: AttestationBand, viaDispute = false) => ({
  id,
  claim: { role, settledAt: `${date}T10:00:00.000Z`, amountBand, viaDispute },
});

test('rows read date, role and band, newest first, and link to the W3C copy', () => {
  const rows = attestedRows([a('x1', '2026-10-01', 'seller', '100-1k'), a('x2', '2026-10-09', 'buyer', 'under-100')], copy, 'en');
  assert.deepEqual(rows.map((r) => r.id), ['x2', 'x1']);
  assert.match(rows[0]!.line, /As buyer · Under 100 USDC$/);
  assert.match(rows[1]!.line, /As seller · 100 to 1,000 USDC$/);
  assert.equal(rows[0]!.href, '/attested/x2');
  assert.equal(rows[0]!.removed, false);
});

test('a deal that went through a dispute says so', () => {
  assert.match(attestedRows([a('x1', '2026-10-01', 'seller', '1k-10k', true)], copy, 'en')[0]!.line, /· Went through a dispute$/);
});

test('a removed statement is shown as removed', () => {
  const rows = attestedRows([{ ...a('x1', '2026-10-01', 'seller', '100-1k'), revokedAt: '2026-10-10T00:00:00Z' }], copy, 'en');
  assert.equal(rows[0]!.removed, true);
});

test('every language has every key, without em dashes', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k])).sort();
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    assert.deepEqual(keys(attestedDealsCopy[locale]), keys(copy), locale);
    assert.doesNotMatch(JSON.stringify(attestedDealsCopy[locale]), /—/);
  }
});

test('the owner can download theirs, visitors see the list without it', () => {
  const owner = readFileSync(new URL('./components/CreditPassport.tsx', import.meta.url), 'utf8');
  const visitor = readFileSync(new URL('./components/PublicPassport.tsx', import.meta.url), 'utf8');
  assert.match(owner, /<AttestedDeals address=\{address\} downloadable=\{isOwner\} \/>/);
  assert.match(visitor, /<AttestedDeals address=\{address\} \/>/);
});

test('the FAQ explains attested deals, the amount range and where to turn them off', async () => {
  const { en } = await import('@/shared/i18n/messages/en');
  const item = en.docsFaqPage.items.find((i: { q: string }) => i.q === 'What is an attested deal?');
  assert.ok(item);
  assert.match(item!.a, /amount range/);
  assert.match(item!.a, /Settings/);
});

test('a long record shows five at a time', () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  assert.deepEqual(attestedPage(rows, 0), { rows: [0, 1, 2, 3, 4], page: 0, pages: 3, from: 1, to: 5 });
  assert.deepEqual(attestedPage(rows, 2).rows, [10, 11]);
  assert.equal(attestedPage(rows, 9).page, 2);
  assert.equal(attestedPage([], 0).pages, 1);
});
