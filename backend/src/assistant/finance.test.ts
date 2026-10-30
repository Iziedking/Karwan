import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAcceptOfferConfirm,
  buildApplyConfirm,
  buildAskConfirm,
  buildFinancierOfferConfirm,
  buildPaySellerConfirm,
  buildRejectOfferConfirm,
  buildStopAskingConfirm,
  financeQuote,
  type FinanceDeal,
  type FinanceOffer,
} from './finance.js';

const SELLER = `0x${'a'.repeat(40)}`;
const OTHER = `0x${'b'.repeat(40)}`;
const JOB = `0x${'1'.repeat(64)}`;
const NOW = Date.UTC(2026, 9, 25);
const deal = (over: Partial<FinanceDeal> = {}): FinanceDeal => ({ jobId: JOB, seller: SELLER, dealAmountUsdc: '500', tradeLane: 'finance', escrowVersion: 'suite', ...over });
const offer = (over: Partial<FinanceOffer> = {}): FinanceOffer => ({
  id: '5f0c1f8e-3f5c-4a52-9a1b-2b5b9f6f0d11', invoiceId: JOB, seller: SELLER, offeredAdvanceUsdc: '470', expectedReturnUsdc: '490',
  status: 'offered', expiresAt: NOW + 3_600_000, recommended: true, funded: true, ...over,
});

test('the quote matches the financier desk: capped by what is left, less the discount', () => {
  assert.deepEqual(financeQuote({ claimableUsdc: '490', discountBps: 500 }), { advanceUsdc: '465.5', returnUsdc: '490' });
  assert.deepEqual(financeQuote({ claimableUsdc: '250', requestedAdvanceUsdc: '400', discountBps: 1000 }), { advanceUsdc: '225', returnUsdc: '250' });
  assert.deepEqual(financeQuote({ claimableUsdc: '490', requestedAdvanceUsdc: '200', discountBps: 250 }), { advanceUsdc: '195', returnUsdc: '200' });
});

test('asking to be paid early shows what is still to be paid and what they ask for', () => {
  const card = buildAskConfirm({ deal: deal(), me: SELLER, factorable: true, claimableUsdc: '490', amountUsdc: 400, leastUsdc: 380 });
  assert.ok(!('error' in card));
  assert.equal(card.intent, 'finance_ask');
  assert.deepEqual(card.payload, { invoiceId: JOB, requestedAdvanceUsdc: '400', minAdvanceUsdc: '380' });
  assert.deepEqual(card.fields.map((f) => f.value), ['490.00 USDC', '400.00 USDC', '380.00 USDC']);
  const all = buildAskConfirm({ deal: deal(), me: SELLER, factorable: true, claimableUsdc: '490' });
  assert.ok(!('error' in all));
  assert.equal(all.payload.requestedAdvanceUsdc, '490');
});

test('asking refuses in plain words; older deals finish as they are', () => {
  const ask = (d: Partial<FinanceDeal>, factorable = true, claimable: string | null = '490', extra = {}) =>
    (buildAskConfirm({ deal: deal(d), me: SELLER, factorable, claimableUsdc: claimable, ...extra }) as { error: string }).error;
  assert.match(ask({ escrowVersion: 'v2' }), /new deals only/);
  assert.match(ask({ escrowVersion: undefined }), /new deals only/);
  assert.match(ask({ escrowVersion: 'v3' }), /not open on deals made on the new escrow/);
  assert.match(ask({ seller: OTHER }), /Only the seller/);
  assert.match(ask({ tradeLane: 'service' }), /business orders/);
  assert.match(ask({ factoringOfferId: 'x' }), /already been paid early/);
  assert.match(ask({ poFinancingId: 'l' }), /purchase-order financing/);
  assert.match(ask({ factoringRequestedAt: 1 }), /already asked/);
  assert.match(ask({}, false), /accepted and fully paid in/);
  assert.match(ask({}, true, null), /Could not read the escrow/);
  assert.match(ask({}, true, '0'), /nothing to be paid early/);
  assert.match(ask({}, true, '490', { amountUsdc: 600 }), /up to 490\.00 USDC/);
  assert.match(ask({}, true, '490', { amountUsdc: 400, leastUsdc: 450 }), /below the amount/);
});

test('stopping is only for a seller who asked and has not been paid', () => {
  const card = buildStopAskingConfirm({ deal: deal({ factoringRequestedAt: 1 }), me: SELLER });
  assert.ok(!('error' in card));
  assert.deepEqual(card.payload, { invoiceId: JOB });
  assert.match((buildStopAskingConfirm({ deal: deal(), me: SELLER }) as { error: string }).error, /not asking/);
  assert.match((buildStopAskingConfirm({ deal: deal({ factoringRequestedAt: 1 }), me: OTHER }) as { error: string }).error, /Only the seller/);
});

test('taking an offer says what is paid now, what the financier is repaid, and that it is final', () => {
  const card = buildAcceptOfferConfirm({ offer: offer(), me: SELLER, nowMs: NOW });
  assert.ok(!('error' in card));
  assert.equal(card.title, 'Get paid 470.00 USDC now');
  assert.deepEqual(card.payload, { offerId: offer().id, jobId: JOB });
  assert.match(card.warning!, /cannot be undone/);
  assert.ok(card.fields.some((f) => f.value === 'Recommended'));
});

test('an offer that cannot be taken says why: not theirs, answered, expired, or not funded', () => {
  const accept = (o: Partial<FinanceOffer>, me = SELLER) => (buildAcceptOfferConfirm({ offer: offer(o), me, nowMs: NOW }) as { error: string }).error;
  assert.match(accept({}, OTHER), /Only the seller/);
  assert.match(accept({ status: 'accepted' }), /already been answered/);
  assert.match(accept({ expiresAt: NOW - 1 }), /expired/);
  assert.match(accept({ funded: false }), /has not added the money/);
  const reject = buildRejectOfferConfirm({ offer: offer({ funded: false }), me: SELLER, nowMs: NOW });
  assert.ok(!('error' in reject));
  assert.deepEqual(reject.payload, { offerId: offer().id, jobId: JOB });
});

test("a financier's offer is priced like the desk and refused before anything moves when the wallet is short", () => {
  const request = { jobId: JOB, dealAmountUsdc: '500', claimableUsdc: '490', factoringAdvanceRecipient: OTHER };
  const card = buildFinancierOfferConfirm({ request, discountPercent: 5, walletUsdc: '1000', signer: 'wallet' });
  assert.ok(!('error' in card));
  assert.deepEqual(card.payload, { invoiceId: JOB, offeredAdvanceUsdc: '465.5', expectedReturnUsdc: '490', expiresInHours: 24, signer: 'wallet', advanceRecipient: OTHER });
  assert.match(card.warning!, /Keep 465\.50 USDC in your wallet/);
  assert.match((buildFinancierOfferConfirm({ request, discountPercent: 5, walletUsdc: '400', signer: 'karwan' }) as { error: string }).error, /Add 65\.50 USDC first/);
  assert.match((buildFinancierOfferConfirm({ request: { ...request, factoringMinAdvanceUsdc: '480' }, discountPercent: 5, walletUsdc: '1000', signer: 'karwan' }) as { error: string }).error, /no less than 480\.00 USDC/);
  assert.match((buildFinancierOfferConfirm({ request, discountPercent: 60, walletUsdc: '1000', signer: 'karwan' }) as { error: string }).error, /between 0\.1% and 50%/);
  assert.match((buildFinancierOfferConfirm({ request, discountPercent: 5, walletUsdc: null, signer: 'karwan' }) as { error: string }).error, /Could not read their wallet/);
});

test('applying to finance deals says what is missing, or that it is done already', () => {
  assert.ok(!('error' in buildApplyConfirm({ status: 'none', eligible: true, reasons: [] })));
  assert.match((buildApplyConfirm({ status: 'approved', eligible: true, reasons: [] }) as { error: string }).error, /already a financier/);
  assert.match((buildApplyConfirm({ status: 'applied', eligible: true, reasons: [] }) as { error: string }).error, /with the team/);
  assert.match((buildApplyConfirm({ status: 'none', eligible: false, reasons: ['Stake some USDC in the vault first'] }) as { error: string }).error, /Stake some USDC/);
});

test('taking an offer says what of the deal guarantee it holds', () => {
  const card = buildAcceptOfferConfirm({ offer: offer({ holdUsdc: '47' }), me: SELLER, nowMs: NOW });
  assert.ok(!('error' in card));
  assert.ok(card.fields.some((f) => f.label === 'Held from your deal guarantee until it is repaid' && f.value === '47.00 USDC'));
  assert.equal(card.payload.putUpGap, undefined);
});

test('a short guarantee makes the card put up the rest first, in one confirmation', () => {
  const card = buildAcceptOfferConfirm({ offer: offer({ holdUsdc: '47', gapUsdc: '12' }), me: SELLER, nowMs: NOW });
  assert.ok(!('error' in card));
  assert.equal(card.title, 'Deposit 12.00 USDC and get paid now');
  assert.equal(card.confirmLabel, 'Deposit 12.00 USDC and get paid now');
  assert.equal(card.payload.putUpGap, true);
});

test('an offer already taken says the financier still has to pay', () => {
  const r = buildAcceptOfferConfirm({ offer: offer({ status: 'awaiting_financier', waitingForFinancier: true }), me: SELLER, nowMs: NOW }) as { error: string };
  assert.match(r.error, /Waiting for the financier to pay/);
});

test('pay the seller shows the amount and the time left, for the financier only', () => {
  const line = { id: offer().id, invoiceId: JOB, financier: OTHER, offeredAdvanceUsdc: '470', status: 'awaiting_financier', sellerDeadline: NOW + 3_600_000 };
  const card = buildPaySellerConfirm({ line, me: OTHER, nowMs: NOW });
  assert.ok(!('error' in card));
  assert.equal(card.intent, 'finance_pay_seller');
  assert.equal(card.title, 'Pay the seller 470.00 USDC');
  assert.deepEqual(card.payload, { offerId: offer().id, jobId: JOB });
  assert.match((buildPaySellerConfirm({ line, me: SELLER, nowMs: NOW }) as { error: string }).error, /Only the financier/);
  assert.match((buildPaySellerConfirm({ line, me: OTHER, nowMs: NOW + 3_600_001 }) as { error: string }).error, /24 hours/);
  assert.match((buildPaySellerConfirm({ line: { ...line, status: 'accepted' }, me: OTHER, nowMs: NOW }) as { error: string }).error, /not waiting/);
});

test('a seller with their own wallet deposits the short guarantee from that wallet, then takes the offer', () => {
  const card = buildAcceptOfferConfirm({ offer: offer({ holdUsdc: '47', gapUsdc: '12' }), me: SELLER, nowMs: NOW, signer: 'wallet' });
  assert.ok(!('error' in card));
  assert.equal(card.title, 'Deposit 12.00 USDC and get paid now');
  assert.equal(card.payload.putUpGap, undefined, 'Karwan cannot deposit from a wallet it does not hold');
  assert.equal(card.payload.walletDepositUsdc, '12');
  assert.match(card.summary, /your wallet signs/i);
});
