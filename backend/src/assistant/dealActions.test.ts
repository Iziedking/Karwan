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
  assert.deepEqual(card.payload, { jobId, caller, seller });
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
