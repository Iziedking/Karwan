import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalAmount, localiseUsdcText } from './localAmounts.js';
import type { UsdcRates } from './usdcRates.js';

///   npx tsx --test src/rates/localAmounts.test.ts

const RATES: UsdcRates = { rates: { NGN: 1346.11, EUR: 0.889118 }, updatedAt: 1_793_865_348_000, source: 'coingecko' };
const NONE: UsdcRates = { rates: {}, updatedAt: null, source: null };

test('a USDC amount reads in the chosen currency, whole naira and euro cents', () => {
  assert.equal(formatLocalAmount(20, 'NGN', RATES), '₦26,922');
  assert.equal(formatLocalAmount(20, 'EUR', RATES), '€17.78');
  assert.equal(formatLocalAmount(20, 'USDC', RATES), null);
  assert.equal(formatLocalAmount(20, 'NGN', NONE), null);
});

test('every price in a message reads in naira only', () => {
  assert.equal(
    localiseUsdcText('*A buyer chose your offer at 20 USDC.* Escrow funded (1,200.50 USDC).', 'NGN', RATES),
    '*A buyer chose your offer at ₦26,922.* Escrow funded (₦1,616,005).',
  );
  assert.equal(localiseUsdcText('You got +5.5 USDC', 'NGN', RATES), 'You got +₦7,404');
});

test('USDC chosen, no fresh rate, or no figure: the message is sent as written', () => {
  const text = 'Your agents spent 0.25 USDC. Pay in USDC on Arc.';
  assert.equal(localiseUsdcText(text, 'USDC', RATES), text);
  assert.equal(localiseUsdcText(text, undefined, RATES), text);
  assert.equal(localiseUsdcText(text, 'NGN', NONE), text);
  assert.equal(localiseUsdcText('Pay in USDC on Arc.', 'NGN', RATES), 'Pay in USDC on Arc.');
});

test('a figure inside a version or a word is left alone', () => {
  assert.equal(localiseUsdcText('v1.20 USDC', 'NGN', RATES), 'v1.20 USDC');
});

test('a deal email leads with the chosen currency and keeps the USDC beside it', async () => {
  const { dealEventInnerHtml } = await import('../emails/dealEventEmail.js');
  const html = dealEventInnerHtml({ kicker: 'Escrow funded', subject: 's', heading: 'h', body: 'b', amount: '20', localAmount: '₦26,922' });
  assert.match(html, /₦26,922<span[^>]*>&nbsp;20\.00 USDC<\/span>/);
  assert.match(dealEventInnerHtml({ kicker: 'k', subject: 's', heading: 'h', body: 'b', amount: '20' }), /20\.00<span[^>]*>&nbsp;USDC<\/span>/);
});

test('an invite, update or cancel email reads in the chosen currency; only the big amount keeps USDC', async () => {
  const { dealInviteHtml } = await import('../emails/dealInvite.js');
  const { dealUpdateHtml } = await import('../emails/dealUpdate.js');
  const { dealCancelledHtml } = await import('../emails/dealCancelled.js');
  const { emailPriceText } = await import('../emails/emailPrice.js');
  const base = { to: 'a@b.c', claimUrl: 'https://karwan.test/invite/x', dealAmountUsdc: '20', inviterMasked: '0x1…2', expiresLabel: 'Expires in 7 days', localAmount: '₦26,922' };
  assert.equal(emailPriceText('20', '₦26,922'), '₦26,922');
  assert.equal(emailPriceText('20'), '20.00 USDC');
  assert.match(dealInviteHtml(base), /₦26,922<span[^>]*>&nbsp;20\.00 USDC<\/span>/);
  assert.match(dealInviteHtml(base), /opened a ₦26,922 deal/);
  assert.match(dealUpdateHtml({ ...base, changedLabels: ['Amount'] }), /now ₦26,922\./);
  assert.match(dealCancelledHtml({ to: 'a@b.c', dealAmountUsdc: '20', inviterMasked: '0x1…2', localAmount: '₦26,922' }), /₦26,922<span[^>]*>&nbsp;20\.00 USDC<\/span>/);
  assert.match(dealCancelledHtml({ to: 'a@b.c', dealAmountUsdc: '5', inviterMasked: '0x1…2' }), /5\.00<span[^>]*>&nbsp;USDC<\/span>/);
});
