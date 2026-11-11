import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UsdcRates } from '../rates/usdcRates.js';
import type { MoneyMovement } from './model.js';
import { figureForViewer, worthOf, worthWhenPaid } from './worth.js';

/// Paid stays paid (view 77): what a payment was worth to each side when it
/// moved is kept on the movement and read from then on.

const NOW = Date.UTC(2026, 10, 9, 10);
const RATES: UsdcRates = { rates: { NGN: 1346.11, KES: 129.91, EUR: 0.889118 }, updatedAt: NOW, source: 'coingecko' };
const SENDER = '0x1111111111111111111111111111111111111111';
const ADA = '0x2222222222222222222222222222222222222222';
const AGENT = '0x3333333333333333333333333333333333333333';

const movement = (over: Partial<MoneyMovement> = {}): MoneyMovement => ({
  reference: 'KW-TEST', operationKey: 'k', kind: 'transfer', state: 'completed', version: 3, attempt: 0, currency: 'USDC',
  amountMicros: '37144000', initiatedBy: SENDER, summary: 'Sent', nextActor: 'none', legs: [], createdAt: NOW, updatedAt: NOW, completedAt: NOW,
  participants: [{ address: SENDER, role: 'owner' }, { address: ADA, role: 'recipient' }, { address: AGENT, role: 'recipient' }],
  ...over,
} as MoneyMovement);

const currencies = async (address: string) => (address === SENDER ? 'NGN' : address === ADA ? 'KES' : undefined);

test('the worth of an amount, whole naira and euro cents', () => {
  assert.deepEqual(worthOf('37144000', 'NGN', RATES, NOW), { currency: 'NGN', amount: '50000', rate: 1346.11, at: NOW });
  assert.equal(worthOf('37144000', 'EUR', RATES, NOW)?.amount, '33.03');
  assert.equal(worthOf('37144000', 'NGN', { rates: {}, updatedAt: null, source: null }, NOW), null);
});

test('each side keeps what the payment was worth in their own currency', async () => {
  const worth = await worthWhenPaid(movement(), { currencyOf: currencies, rates: async () => RATES, now: () => NOW });
  assert.deepEqual(Object.keys(worth).sort(), [SENDER, ADA].sort(), 'someone who reads USDC, or is not a person on Karwan, keeps none');
  assert.equal(worth[SENDER]!.amount, '50000');
  assert.equal(worth[ADA]!.currency, 'KES');
  assert.equal(worth[ADA]!.amount, '4825');
});

test('the sender who typed a figure reads that figure; the other side reads their worth', () => {
  const typed = { currency: 'NGN' as const, amount: '50000', rate: 1346.11, at: NOW };
  const m = movement({ local: typed, worth: { [ADA]: { currency: 'KES', amount: '4825', rate: 129.91, at: NOW } } });
  assert.deepEqual(figureForViewer(m, SENDER), { currency: 'NGN', amount: '50000' });
  assert.deepEqual(figureForViewer(m, ADA), { currency: 'KES', amount: '4825' });
  assert.equal(figureForViewer(m, AGENT), undefined);
  assert.equal(figureForViewer(m, undefined), undefined);
});

test('a payment from before this was kept has no figure, so it reads about', () => {
  assert.equal(figureForViewer(movement(), SENDER), undefined);
});

test('with no rate nothing is kept, and the payment still stands', async () => {
  const worth = await worthWhenPaid(movement(), { currencyOf: currencies, rates: async () => ({ rates: {}, updatedAt: null, source: null }), now: () => NOW });
  assert.deepEqual(worth, {});
});

test('a deal keeps its worth on the one save that settles it (view 77)', async () => {
  const { becameSettled } = await import('../db/deals.js');
  assert.equal(becameSettled({}, { settledAt: NOW }), true);
  assert.equal(becameSettled({ settledAt: NOW }, { settledAt: NOW }), false, 'saving the worth afterwards does not start it again');
  assert.equal(becameSettled({}, {}), false);
});

test('the buyer and the seller each keep the worth of a settled deal', async () => {
  const { worthToPeople } = await import('./worth.js');
  const worth = await worthToPeople('74280000', [SENDER, ADA, ADA.toUpperCase().replace('0X', '0x')], { currencyOf: currencies, rates: async () => RATES, now: () => NOW });
  assert.equal(worth[SENDER]!.amount, '99989');
  assert.equal(worth[ADA]!.currency, 'KES');
  assert.equal(Object.keys(worth).length, 2);
});
