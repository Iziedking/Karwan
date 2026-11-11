import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits } from 'viem';
import type { UsdcRates } from '../rates/usdcRates.js';
import { localFromQuote } from '../rates/quote.js';
import { keepOnCard, saidFigure } from './saidFigure.js';

const NOW = 1_793_865_348_000;
const RATES: UsdcRates = { rates: { NGN: 1346.11 }, updatedAt: NOW, source: 'coingecko' };
const deps = { rates: async () => RATES, now: () => NOW, secret: 'test-secret' };
const said = (amounts: Record<string, number>) => ({ said: { currency: 'NGN' as const, amounts } });

test('a figure said in naira comes with its USDC, its text and a quote the record accepts', async () => {
  const s = await saidFigure(said({ rateUsdc: 15000 }), 'rateUsdc', deps);
  assert.ok(s);
  assert.equal(s.text, '₦15,000');
  assert.equal(s.usdc, 11.14322);
  const kept = localFromQuote(s.quote, parseUnits(String(s.usdc), 6), NOW + 60_000, 'test-secret');
  assert.deepEqual(kept && { currency: kept.currency, amount: kept.amount }, { currency: 'NGN', amount: '15000' });
});

test('nothing is kept for a figure given in USDC, another field, or with no rate', async () => {
  assert.equal(await saidFigure({}, 'rateUsdc', deps), null);
  assert.equal(await saidFigure(said({ budgetUsdc: 5 }), 'rateUsdc', deps), null);
  assert.equal(await saidFigure(said({ rateUsdc: 15000 }), 'rateUsdc', { ...deps, rates: async () => ({ rates: {}, updatedAt: null, source: null }) }), null);
});

test('the card reads the figure as said and carries the quote', async () => {
  const s = await saidFigure(said({ rateUsdc: 15000 }), 'rateUsdc', deps);
  const card = { fields: [{ label: 'Your rate an hour', value: '11.14 USDC' }, { label: 'Note', value: 'hi' }], payload: { requestId: 'wr_1', rateUsdc: '11.14322' } };
  const kept = keepOnCard(card, s, ['Your rate an hour']);
  assert.deepEqual(kept.fields, [{ label: 'Your rate an hour', value: '₦15,000' }, { label: 'Note', value: 'hi' }]);
  assert.equal((kept.payload as { quote?: string }).quote, s!.quote);
  assert.equal(keepOnCard(card, null, ['Your rate an hour']), card);
});

test('a send said in naira opens the Send screen on that figure', async () => {
  const { buildNavigateAction } = await import('./actions.js');
  const s = await saidFigure(said({ amountUsdc: 50000 }), 'amountUsdc', deps);
  assert.ok(s);
  const built = buildNavigateAction({ destination: 'send', to: 'ada', amountUsdc: s.usdc, said: { currency: s.currency, amount: s.amount } });
  assert.ok(!('error' in built));
  const query = new URLSearchParams(built.href.split('?')[1]);
  assert.equal(query.get('said'), '50000');
  assert.equal(query.get('cur'), 'NGN');
  assert.equal(query.get('amount'), String(s.usdc));
  const plain = buildNavigateAction({ destination: 'send', to: 'ada', amountUsdc: 20, said: { currency: 'ngn<script>', amount: '1' } });
  assert.ok(!('error' in plain) && !plain.href.includes('said'), 'a figure that is not a currency and an amount is left out');
});
