import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChooseOfferConfirm,
  buildEditRequestConfirm,
  buildRaiseOfferConfirm,
  buildRequestExtensionConfirm,
  buildRespondExtensionConfirm,
  buildCancelDealConfirm,
  buildDisputeStatementConfirm,
  buildEscalateDisputeConfirm,
  buildDeclineDealConfirm,
  buildRaiseProblemConfirm,
  buildGoodsArrivedConfirm,
  buildReviewDeliveryMyselfConfirm,
  buildClaimPaymentConfirm,
  buildStillReviewingConfirm,
  buildDelayAppealConfirm,
  buildAnswerDelayAppealConfirm,
  buildTakeBackDealConfirm,
  buildChangeDealTermsConfirm,
  durationText,
  buildMakeOfferConfirm,
  buildWithdrawOfferConfirm,
  buildLowerOfferConfirm,
  buildAcceptSellerOfferConfirm,
  buildNearMissConfirm,
  buildReconsiderOfferConfirm,
  buildEditListingConfirm,
  buildStopAgentBidConfirm,
  buildConfirmGoodsReceivedConfirm,
} from './dealActions.js';

const caller = '0x' + 'a'.repeat(40);
const seller = '0x' + 'b'.repeat(40);
const jobId = '0x' + 'c'.repeat(64);

function ok<T extends object>(card: T | { error: string }): T {
  assert.ok(!('error' in card), JSON.stringify(card));
  return card as T;
}

test('choosing an offer warns that escrow is funded from the buyer agent and names seller and price', () => {
  const card = ok(buildChooseOfferConfirm({ caller, jobId, seller, sellerLabel: 'Ada Designs', priceUsdc: '120' }));
  assert.equal(card.intent, 'choose_offer');
  assert.deepEqual(card.payload, { jobId, caller, seller, amountUsdc: 120 });
  assert.match(card.warning ?? '', /buyer agent/);
  assert.ok(card.fields.some((f) => f.value === '120 USDC'));
  assert.ok(card.fields.some((f) => f.value === 'Ada Designs'));
  assert.doesNotMatch(JSON.stringify(card), /—|\$/);
});

test('choosing an offer needs a seller', () => {
  assert.ok('error' in buildChooseOfferConfirm({ caller, jobId, seller: '', sellerLabel: 'x', priceUsdc: '1' }));
});

test('editing a request carries only the changed fields', () => {
  const card = ok(buildEditRequestConfirm({ caller, jobId, briefText: 'A logo and a favicon' }));
  assert.equal(card.intent, 'edit_request');
  assert.deepEqual(card.payload, { jobId, caller, briefText: 'A logo and a favicon' });
  const flex = ok(buildEditRequestConfirm({ caller, jobId, negotiationMaxIncreasePct: 15 }));
  assert.deepEqual(flex.payload, { jobId, caller, negotiationMaxIncreasePct: 15 });
  assert.ok('error' in buildEditRequestConfirm({ caller, jobId }));
});

test('raising the price must go above the agreed price', () => {
  const card = ok(buildRaiseOfferConfirm({ caller, jobId, currentPriceUsdc: '100', priceUsdc: 130 }));
  assert.equal(card.intent, 'raise_offer');
  assert.deepEqual(card.payload, { jobId, caller, priceUsdc: '130' });
  assert.ok('error' in buildRaiseOfferConfirm({ caller, jobId, currentPriceUsdc: '100', priceUsdc: 90 }));
});

test('an extension request asks for whole days and states the new date', () => {
  const card = ok(buildRequestExtensionConfirm({ caller, jobId, days: 3, currentDeadlineUnix: 1_800_000_000, reason: 'Client feedback came late' }));
  assert.equal(card.intent, 'request_extension');
  assert.deepEqual(card.payload, { jobId, caller, additionalSeconds: 3 * 86_400, reason: 'Client feedback came late' });
  assert.ok(card.fields.some((f) => f.label === 'New deadline' && f.value === new Date((1_800_000_000 + 3 * 86_400) * 1000).toISOString().slice(0, 10)));
  assert.ok('error' in buildRequestExtensionConfirm({ caller, jobId, days: 0, currentDeadlineUnix: 1 }));
  assert.ok('error' in buildRequestExtensionConfirm({ caller, jobId, days: 31, currentDeadlineUnix: 1 }));
});

test('answering an extension maps approve and decline to the route values', () => {
  const yes = ok(buildRespondExtensionConfirm({ caller, jobId, decision: 'approve', days: 2 }));
  assert.equal(yes.intent, 'respond_extension');
  assert.deepEqual(yes.payload, { jobId, caller, decision: 'approved' });
  const no = ok(buildRespondExtensionConfirm({ caller, jobId, decision: 'decline', days: 2 }));
  assert.deepEqual(no.payload, { jobId, caller, decision: 'declined' });
  assert.match(no.summary, /current deadline/);
  const lateNo = ok(buildRespondExtensionConfirm({ caller, jobId, decision: 'decline', days: 2, deadlinePassed: true }));
  assert.match(lateNo.summary, /money comes back to you/);
});

test('a request after the delivery date shows the date an approval now gives, and that the money waits', () => {
  const deadline = 1_800_000_000;
  const now = deadline + 3_600;
  const card = ok(buildRequestExtensionConfirm({ caller, jobId, days: 2, currentDeadlineUnix: deadline, nowUnix: now }));
  assert.ok(card.fields.some((f) => f.label === 'New deadline' && f.value === new Date((now + 2 * 86_400) * 1000).toISOString().slice(0, 10)));
  assert.match(card.summary, /money stays in the deal until they answer/);
  const early = ok(buildRequestExtensionConfirm({ caller, jobId, days: 2, currentDeadlineUnix: deadline, nowUnix: deadline - 60 }));
  assert.match(early.summary, /current deadline stands/);
});

test('cancelling a deal: propose needs a reason, accept warns about the refund', () => {
  const propose = ok(buildCancelDealConfirm({ caller, jobId, step: 'propose', amountUsdc: '200', reason: 'Scope changed' }));
  assert.equal(propose.intent, 'cancel_deal');
  assert.deepEqual(propose.payload, { jobId, caller, step: 'propose', reason: 'Scope changed' });
  assert.ok('error' in buildCancelDealConfirm({ caller, jobId, step: 'propose', amountUsdc: '200' }));
  const accept = ok(buildCancelDealConfirm({ caller, jobId, step: 'accept', amountUsdc: '200' }));
  assert.match(accept.warning ?? '', /cannot be undone/);
  const decline = ok(buildCancelDealConfirm({ caller, jobId, step: 'decline', amountUsdc: '200' }));
  assert.deepEqual(decline.payload, { jobId, caller, step: 'decline' });
});

test('a dispute statement needs all three answers and at most five http links', () => {
  const card = ok(buildDisputeStatementConfirm({ caller, jobId, received: 'Two of three screens', missing: 'The settings screen', late: 'Four days', links: ['https://example.com/a'] }));
  assert.equal(card.intent, 'dispute_statement');
  assert.deepEqual(card.payload, { jobId, caller, received: 'Two of three screens', missing: 'The settings screen', late: 'Four days', links: ['https://example.com/a'] });
  assert.ok('error' in buildDisputeStatementConfirm({ caller, jobId, received: '', missing: 'x', late: 'x', links: [] }));
  assert.ok('error' in buildDisputeStatementConfirm({ caller, jobId, received: 'x', missing: 'x', late: 'x', links: ['ftp://x'] }));
  assert.ok('error' in buildDisputeStatementConfirm({ caller, jobId, received: 'x', missing: 'x', late: 'x', links: Array(6).fill('https://x.y') }));
});

test('escalating a dispute and declining a deal build plain cards', () => {
  const esc = ok(buildEscalateDisputeConfirm({ caller, jobId, amountUsdc: '50' }));
  assert.equal(esc.intent, 'escalate_dispute');
  assert.deepEqual(esc.payload, { jobId, caller });
  const dec = ok(buildDeclineDealConfirm({ caller, jobId, amountUsdc: '50', counterpartyLabel: 'Bola', note: 'Fully booked this month' }));
  assert.equal(dec.intent, 'decline_deal');
  assert.deepEqual(dec.payload, { jobId, caller, note: 'Fully booked this month' });
  assert.ok('error' in buildDeclineDealConfirm({ caller, jobId, amountUsdc: '50', counterpartyLabel: 'Bola', note: '' }));
});

test('every new card has a unique id and no em dashes or dollar signs', () => {
  const a = ok(buildEscalateDisputeConfirm({ caller, jobId, amountUsdc: '50' }));
  const b = ok(buildEscalateDisputeConfirm({ caller, jobId, amountUsdc: '50' }));
  assert.notEqual(a.id, b.id);
  for (const card of [
    a,
    ok(buildChooseOfferConfirm({ caller, jobId, seller, sellerLabel: 'S', priceUsdc: '9' })),
    ok(buildRequestExtensionConfirm({ caller, jobId, days: 1, currentDeadlineUnix: 1_800_000_000 })),
    ok(buildCancelDealConfirm({ caller, jobId, step: 'accept', amountUsdc: '9' })),
  ]) {
    assert.doesNotMatch(JSON.stringify(card), /—|–|\$/);
  }
});

test('choosing an unverified seller says so on the card and carries the acknowledgement', () => {
  const card = ok(buildChooseOfferConfirm({ caller, jobId, seller, sellerLabel: 'Kemi', priceUsdc: '60', unverified: true }));
  assert.match(card.warning ?? '', /^Kemi is not verified\. Karwan has not checked their identity or past work\./);
  assert.equal(card.payload.acknowledgeUnverified, true);
  const verified = ok(buildChooseOfferConfirm({ caller, jobId, seller, sellerLabel: 'Ada', priceUsdc: '80' }));
  assert.equal(verified.payload.acknowledgeUnverified, undefined);
});

test('raising a problem is one card that names the reason and the 72 hours each side gets', () => {
  const card = buildRaiseProblemConfirm({ caller: '0xbuyer', jobId: '0xdeal', amountUsdc: '600', reason: '  The logo is the wrong colour  ' });
  assert.ok(!('error' in card));
  if ('error' in card) return;
  assert.equal(card.intent, 'raise_problem');
  assert.equal(card.title, 'Raise a problem');
  assert.match(card.summary ?? '', /72 hours/);
  assert.deepEqual(card.payload, { jobId: '0xdeal', caller: '0xbuyer', reason: 'The logo is the wrong colour' });
  assert.deepEqual(buildRaiseProblemConfirm({ caller: '0xbuyer', jobId: '', amountUsdc: '600', reason: 'x' }), { error: 'Missing the deal id.' });
  assert.deepEqual(buildRaiseProblemConfirm({ caller: '0xbuyer', jobId: '0xdeal', amountUsdc: '600', reason: '  ' }), { error: 'Ask them what is wrong, in a sentence.' });
});

test('durations read in minutes on testnet windows and in hours or days on real ones', () => {
  assert.equal(durationText(300_000), '5 minutes');
  assert.equal(durationText(600_000), '10 minutes');
  assert.equal(durationText(3 * 3_600_000), '3 hours');
  assert.equal(durationText(72 * 3_600_000), '3 days');
  assert.equal(durationText(24 * 3_600_000), '1 day');
});

test('goods arrived, reviewing it myself and claiming carry only the caller to the page route', () => {
  for (const card of [
    ok(buildGoodsArrivedConfirm({ caller, jobId, amountUsdc: '200', carrier: 'DHL' })),
    ok(buildReviewDeliveryMyselfConfirm({ caller, jobId, amountUsdc: '200' })),
    ok(buildClaimPaymentConfirm({ caller, jobId, amountUsdc: '200' })),
    ok(buildDelayAppealConfirm({ caller, jobId, amountUsdc: '200', responseMs: 300_000 })),
    ok(buildTakeBackDealConfirm({ caller, jobId, amountUsdc: '200', paidIn: true })),
  ]) {
    assert.deepEqual(card.payload, { jobId, caller });
  }
  assert.match(ok(buildGoodsArrivedConfirm({ caller, jobId, amountUsdc: '200' })).summary ?? '', /does not pay the seller/);
  assert.match(ok(buildClaimPaymentConfirm({ caller, jobId, amountUsdc: '200' })).warning ?? '', /cannot be undone/);
  assert.match(ok(buildDelayAppealConfirm({ caller, jobId, amountUsdc: '200', responseMs: 300_000 })).summary ?? '', /5 minutes/);
});

test('taking a deal back says whether money comes back', () => {
  assert.match(ok(buildTakeBackDealConfirm({ caller, jobId, amountUsdc: '200', paidIn: true })).summary ?? '', /200 USDC comes back/);
  assert.match(ok(buildTakeBackDealConfirm({ caller, jobId, amountUsdc: '200', paidIn: false })).summary ?? '', /no money has moved/);
  assert.match(ok(buildTakeBackDealConfirm({ caller, jobId, amountUsdc: '200', paidIn: true, missedDeadline: true })).summary ?? '', /deadline passed with nothing delivered/);
});

test('more review time says how much and refuses once used up', () => {
  const card = ok(buildStillReviewingConfirm({ caller, jobId, stepMs: 24 * 3_600_000, left: 2 }));
  assert.match(card.summary ?? '', /1 day/);
  assert.ok(card.fields.some((f) => f.label === 'Left after this' && f.value === '1'));
  assert.match((buildStillReviewingConfirm({ caller, jobId, stepMs: 600_000, left: 0 }) as { error: string }).error, /used all/);
});

test('answering a delay appeal needs a reason the seller sees', () => {
  assert.deepEqual(ok(buildAnswerDelayAppealConfirm({ caller, jobId, reason: '  Checking the last part  ' })).payload, { jobId, caller, reason: 'Checking the last part' });
  assert.ok('error' in buildAnswerDelayAppealConfirm({ caller, jobId, reason: '   ' }));
  assert.ok('error' in buildAnswerDelayAppealConfirm({ caller, jobId, reason: 'x'.repeat(601) }));
});

test('changing terms is an edit for the buyer and a counter for the seller, and refuses nothing to change', () => {
  const edit = ok(buildChangeDealTermsConfirm({ caller, jobId, as: 'buyer', currentAmountUsdc: '200', amountUsdc: 250, deadlineDays: 7 }));
  assert.deepEqual(edit.payload, { jobId, caller, as: 'buyer', dealAmountUsdc: 250, deadlineDays: 7 });
  assert.equal(edit.title, 'Change the deal');
  const counter = ok(buildChangeDealTermsConfirm({ caller: seller, jobId, as: 'seller', currentAmountUsdc: '200', terms: ' Two logos ' }));
  assert.deepEqual(counter.payload, { jobId, caller: seller, as: 'seller', terms: 'Two logos' });
  assert.equal(counter.title, 'Send a counter');
  assert.match((buildChangeDealTermsConfirm({ caller, jobId, as: 'buyer', currentAmountUsdc: '200' }) as { error: string }).error, /Say what to change/);
  assert.ok('error' in buildChangeDealTermsConfirm({ caller, jobId, as: 'buyer', currentAmountUsdc: '200', deadlineDays: 0 }));
  assert.ok('error' in buildChangeDealTermsConfirm({ caller, jobId, as: 'buyer', currentAmountUsdc: '200', amountUsdc: -1 }));
});

const NOW = 1_800_000_000;
const request = { me: seller, jobId, buyerUser: caller, briefText: 'Logo for a bakery', budgetUsdc: '100', requestDeadlineUnix: NOW + 20 * 86_400, jobOpen: true, nowUnix: NOW };

test("a seller's own offer carries the request page body and the request's rules", () => {
  const card = ok(buildMakeOfferConfirm({ ...request, priceUsdc: 80, deliverInDays: 5, note: ' Two drafts ' }));
  assert.deepEqual(card.payload, { jobId, priceUsdc: '80', deliverByUnix: NOW + 5 * 86_400, note: 'Two drafts' });
  const refuse = (over: object) => (buildMakeOfferConfirm({ ...request, priceUsdc: 80, deliverInDays: 5, note: '', ...over }) as { error: string }).error;
  assert.match(refuse({ me: caller }), /their own request/);
  assert.match(refuse({ jobOpen: false }), /no longer taking offers/);
  assert.match(refuse({ priceUsdc: 5000 }), /far above the budget/);
  assert.match(refuse({ deliverInDays: 90 }), /too long after/);
  assert.match(refuse({ note: 'x'.repeat(281) }), /280 characters/);
});

test('lowering an offer shows both prices, carries the new one, and refuses a higher one (view 35)', () => {
  const card = ok(buildLowerOfferConfirm({ jobId, offerId: 'o1', fromUsdc: '280', toUsdc: '260' }));
  assert.deepEqual(card.payload, { jobId, offerId: 'o1', priceUsdc: '260' });
  assert.ok(card.fields.some((f) => f.value === '280 USDC') && card.fields.some((f) => f.value === '260 USDC'));
  assert.match(String((buildLowerOfferConfirm({ jobId, offerId: 'o1', fromUsdc: '280', toUsdc: '280' }) as { error: string }).error), /lower than/);
});

test('withdrawing and taking a seller offer name the offer only by id', () => {
  assert.deepEqual(ok(buildWithdrawOfferConfirm({ jobId, offerId: 'o1', priceUsdc: '80' })).payload, { jobId, offerId: 'o1' });
  const take = ok(buildAcceptSellerOfferConfirm({ jobId, offerId: 'o1', sellerLabel: '@ada', priceUsdc: '80', fundedUsdc: '81.6', deliverByUnix: NOW }));
  assert.deepEqual(take.payload, { jobId, offerId: 'o1' });
  assert.equal(take.confirmLabel, 'Take it and pay 81.6 USDC');
  assert.ok(take.fields.some((f) => f.label === 'Paid in with the fee'));
});

test('a near match goes ahead or passes, and a passed price can be brought back', () => {
  const go = ok(buildNearMissConfirm({ caller, jobId, decision: 'proceed', askedSide: 'buyer', priceUsdc: '120' }));
  assert.equal(go.intent, 'near_miss_proceed');
  assert.match(go.summary ?? '', /outside the limits you set/);
  const pass = ok(buildNearMissConfirm({ caller, jobId, decision: 'pass', askedSide: 'buyer', priceUsdc: '120' }));
  assert.equal(pass.intent, 'near_miss_pass');
  assert.deepEqual(pass.payload, { jobId, caller });
  assert.deepEqual(ok(buildReconsiderOfferConfirm({ caller, jobId, priceUsdc: '120' })).payload, { jobId, caller });
});

test('editing an offer sends only what changes, within the offer form limits', () => {
  const card = ok(buildEditListingConfirm({ caller: seller, listingId: 'lst_1', currentTitle: 'Logos', currentPriceUsdc: '50', askingPriceUsdc: 65 }));
  assert.deepEqual(card.payload, { listingId: 'lst_1', caller: seller, askingPriceUsdc: 65 });
  assert.ok(card.fields.some((f) => f.value === '50 to 65 USDC'));
  assert.match((buildEditListingConfirm({ caller: seller, listingId: 'lst_1', currentTitle: 'Logos', currentPriceUsdc: '50' }) as { error: string }).error, /Say what to change/);
  assert.ok('error' in buildEditListingConfirm({ caller: seller, listingId: 'lst_1', currentTitle: 'Logos', currentPriceUsdc: '50', title: 'ab' }));
});

test('stopping an agent bid and confirming goods received carry the page bodies', () => {
  assert.deepEqual(ok(buildStopAgentBidConfirm({ jobId, briefText: 'Logo' })).payload, { jobId });
  const pod = ok(buildConfirmGoodsReceivedConfirm({ address: caller, jobId, amountUsdc: '300', podHash: '0x' + '9'.repeat(64) }));
  assert.deepEqual(pod.payload, { address: caller, invoiceId: jobId, podHash: '0x' + '9'.repeat(64) });
  assert.match(pod.summary ?? '', /does not pay the seller/);
});
