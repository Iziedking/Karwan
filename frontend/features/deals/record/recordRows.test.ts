import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { DealRecordView } from '@/core/api';
import { dealRecordCopy } from '@/shared/i18n/messages/dealRecord';
import { recordRows } from './recordRows';

const t = dealRecordCopy.en;
const DAY = 86_400_000;
const T = Date.UTC(2026, 9, 20, 10);
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const record: DealRecordView = {
  reference: 'D68F-E7D8',
  kind: 'goods',
  agreed: { digest: null, buyerAt: T + DAY, sellerAt: T, title: 'Cotton lint, 20 bales', priceUsdc: '500' },
  held: { usdc: '500', at: T + DAY, tx: '0xheld', reference: null },
  stages: [{ index: 0, confirmed: { way: 'buyer_confirmed', at: T + 5 * DAY }, released: { sellerUsdc: '495', refundUsdc: '0', feeUsdc: '5', at: T + 6 * DAY, tx: '0xpaid', reference: null } }],
  ended: 'settled',
  endedAt: T + 6 * DAY,
};
const text = (rows: ReturnType<typeof recordRows>, key: string) => rows.find((r) => r.key === key)!.lines.map((l) => l.text);

test('five rows, in order, from what the deal did', () => {
  const rows = recordRows(record, 'seller', T + 7 * DAY, t, date);
  assert.deepEqual(rows.map((r) => r.key), ['agreed', 'held', 'confirmed', 'released', 'signed']);
  assert.deepEqual(text(rows, 'agreed'), ['500 USDC for Cotton lint, 20 bales · both sides on 2026-10-21']);
  assert.deepEqual(text(rows, 'held'), ['500 USDC from 2026-10-21']);
  assert.equal(rows[1].lines[0].tx, '0xheld');
  assert.deepEqual(text(rows, 'confirmed'), ['The buyer confirmed it · 2026-10-25']);
  assert.deepEqual(text(rows, 'released'), ['495 USDC to you · 5 USDC fee · 2026-10-26']);
  assert.equal(rows[3].lines[0].tx, '0xpaid');
  assert.deepEqual(text(rows, 'signed'), ['Signed by Karwan · 2026-10-27']);
});

test('the buyer and a stranger with the link read the release from their side', () => {
  assert.deepEqual(text(recordRows(record, 'buyer', T, t, date), 'released'), ['495 USDC to the seller · 5 USDC fee · 2026-10-26']);
  assert.deepEqual(text(recordRows(record, null, T, t, date), 'released'), ['495 USDC to the seller · 5 USDC fee · 2026-10-26']);
});

test('a refund reads as money back, and each stage is named when there are several', () => {
  const split: DealRecordView = {
    ...record,
    stages: [
      record.stages[0],
      { index: 1, confirmed: { way: 'dispute', at: T + 9 * DAY }, released: { sellerUsdc: '0', refundUsdc: '250', feeUsdc: null, at: T + 9 * DAY, tx: null, reference: null } },
    ],
  };
  assert.deepEqual(text(recordRows(split, 'buyer', T, t, date), 'confirmed'), ['Stage 1: The buyer confirmed it · 2026-10-25', 'Stage 2: Decided in a dispute · 2026-10-29']);
  assert.deepEqual(text(recordRows(split, 'buyer', T, t, date), 'released'), ['Stage 1: 495 USDC to the seller · 5 USDC fee · 2026-10-26', 'Stage 2: 250 USDC back to you · 2026-10-29']);
  assert.deepEqual(text(recordRows(split, null, T, t, date), 'released')[1], 'Stage 2: 250 USDC back to the buyer · 2026-10-29');
});

test('what the deal did not record says so, never a guess', () => {
  const bare: DealRecordView = { ...record, agreed: { ...record.agreed, buyerAt: null }, held: null, stages: [] };
  const rows = recordRows(bare, 'buyer', T, t, date);
  assert.deepEqual(text(rows, 'agreed'), ['500 USDC for Cotton lint, 20 bales']);
  assert.deepEqual(text(rows, 'held'), [t.notRecorded]);
  assert.deepEqual(text(rows, 'confirmed'), [t.notRecorded]);
  assert.deepEqual(text(rows, 'released'), [t.notRecorded]);
});
