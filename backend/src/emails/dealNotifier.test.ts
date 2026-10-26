import assert from 'node:assert/strict';
import test from 'node:test';
import { amountFor, contentFor, recipientsFor } from './dealNotifier.js';
import type { KarwanEvent } from '../events.js';

const edited = (actor: 'buyer' | 'seller'): KarwanEvent => ({
  type: 'deal.direct.edited',
  jobId: '0xabc',
  actor,
  ts: 0,
  payload: { buyer: '0xb', seller: '0xs', dealAmountUsdc: '40', changedLabels: ['Amount updated to 40 USDC', 'Work description updated'] },
} as unknown as KarwanEvent);

test('resubmitted terms reach only the side that did not change them', () => {
  const toSeller = contentFor(edited('buyer'), 'seller', 'service');
  assert.ok(toSeller);
  assert.match(toSeller.subject, /The buyer sent new terms/);
  assert.match(toSeller.body, /Amount updated to 40 USDC\. Work description updated\./);
  assert.equal(contentFor(edited('buyer'), 'buyer', 'service'), null);
  assert.match(contentFor(edited('seller'), 'buyer', 'service')!.subject, /The seller sent new terms/);
  assert.equal(amountFor(edited('buyer')), '40');
});

test('an offer on a request reaches only the person who posted it', () => {
  const offer = {
    type: 'offer.created', jobId: '0xjob', actor: 'seller', ts: 0,
    payload: { offerId: 'o1', buyerUser: '0xb', sellerUser: '0xs', priceUsdc: '35' },
  } as unknown as KarwanEvent;
  const toBuyer = contentFor(offer, 'buyer', 'service');
  assert.ok(toBuyer);
  assert.match(toBuyer.subject, /made an offer on your request at 35 USDC/);
  assert.equal(contentFor(offer, 'seller', 'service'), null);
  assert.equal(amountFor(offer), '35');
});

test('a paused release tells the buyer why, with the private note only for them', () => {
  const blocked = {
    type: 'deal.release.blocked', jobId: '0xjob', actor: 'platform', ts: 0,
    payload: { buyer: '0xb', seller: '0xs', reason: 'requirement-mismatch', detail: 'off-request' },
  } as unknown as KarwanEvent;
  const toBuyer = contentFor(blocked, 'buyer', 'service', 'The link is a landing page, not the logo files.');
  assert.ok(toBuyer);
  assert.match(toBuyer.body, /does not match what you asked for/);
  assert.match(toBuyer.body, /landing page, not the logo files/);
  const toSeller = contentFor(blocked, 'seller', 'service', 'The link is a landing page, not the logo files.');
  assert.ok(toSeller);
  assert.doesNotMatch(toSeller.body, /landing page/);
  assert.match(toSeller.body, /Send the right link/);
});

test('a deadline refund tells the buyer the money is back and the seller why', () => {
  const event = {
    type: 'deal.dispute.auto_resolved',
    jobId: '0xabc',
    actor: 'platform',
    ts: 0,
    payload: { buyer: '0xb', seller: '0xs', sellerBps: 0, cause: 'failed-at-deadline', dealAmountUsdc: '40' },
  } as unknown as KarwanEvent;
  const buyer = contentFor(event, 'buyer', 'service')!;
  const seller = contentFor(event, 'seller', 'service')!;
  assert.match(buyer.heading, /refunded/i);
  assert.match(seller.body, /did not pass the delivery check by the deadline/);
  assert.doesNotMatch(buyer.body + seller.body, /—/);
});

const shortlistReady = (notify: boolean, count = 3): KarwanEvent => ({
  type: 'request.shortlist',
  jobId: '0xjob',
  actor: 'buyer',
  ts: 0,
  payload: { buyer: '0xb', count, notify, entries: [] },
} as unknown as KarwanEvent);

test('a ready shortlist emails the buyer to come and choose', () => {
  const c = contentFor(shortlistReady(true), 'buyer', 'service');
  assert.match(c!.subject, /Your agent found 3 sellers/);
  assert.match(c!.body, /Nothing moves until you choose and confirm/);
  assert.match(c!.ctaUrl ?? '/jobs/0xjob', /\/jobs\/0xjob$/);
});

test('shortlist updates that are not worth a message, and empty lists, send no email', () => {
  assert.equal(contentFor(shortlistReady(false), 'buyer', 'service'), null);
  assert.equal(contentFor(shortlistReady(true, 0), 'buyer', 'service'), null);
});

test('in shortlist mode a match tells the buyer they choose, not that escrow funds by itself', () => {
  const matched = { type: 'deal.matched', jobId: '0xjob', actor: 'buyer', ts: 0, payload: { buyer: '0xb', seller: '0xs', agreedPriceUsdc: '90' } } as unknown as KarwanEvent;
  const toBuyer = contentFor(matched, 'buyer', 'service', undefined, { shortlistMode: true });
  assert.match(toBuyer!.body, /Choose them, or anyone else on your shortlist/);
  assert.doesNotMatch(toBuyer!.body, /automatically/);
  const toSeller = contentFor(matched, 'seller', 'service', undefined, { shortlistMode: true });
  assert.match(toSeller!.body, /The buyer is choosing from a shortlist/);
});

test('a buyer waiting on the seller World ID check emails the seller, and only the seller', () => {
  const e = { type: 'request.world_check', jobId: '0xjob', actor: 'platform', ts: 0, payload: { buyer: '0xb', seller: '0xs', priceUsdc: '1200', waitingOn: 'seller', buyerConfirmed: true } } as unknown as KarwanEvent;
  const c = contentFor(e, 'seller', 'service');
  assert.match(c!.subject, /A buyer chose your offer/);
  assert.match(c!.body, /confirm with World ID/);
  assert.equal(contentFor(e, 'buyer', 'service'), null);
  const notYet = { ...e, payload: { ...e.payload, waitingOn: 'buyer' } } as unknown as KarwanEvent;
  assert.equal(contentFor(notYet, 'seller', 'service'), null);
});

test('ask me first emails the seller a link to the request, and nobody else', () => {
  const suggestion = {
    type: 'agent.suggestion', actor: 'seller', ts: 0,
    payload: { sellerUser: '0xowner', jobId: '0xjob', priceUsdc: '35.00', title: 'Logo for a bakery' },
  } as unknown as KarwanEvent;
  const toSeller = contentFor(suggestion, 'seller', 'service');
  assert.ok(toSeller);
  assert.equal(toSeller.subject, 'Your agent found a request that fits. Make an offer?');
  assert.match(toSeller.body, /Logo for a bakery/);
  assert.match(toSeller.body, /35\.00 USDC/);
  assert.equal(contentFor(suggestion, 'buyer', 'service'), null);
});

test('a seller asked to set up their record gets one plain email, and nobody else', () => {
  const offers = { type: 'record.setup_needed', actor: 'platform', ts: 0, payload: { sellerUser: '0xowner', reason: 'offers' } } as unknown as KarwanEvent;
  const toSeller = contentFor(offers, 'seller', 'service');
  assert.ok(toSeller);
  assert.equal(toSeller.subject, 'Set up your Karwan record so your agent can make offers');
  assert.doesNotMatch(toSeller.body, /stake|vault|yield|escrow family|—/i);
  assert.equal(contentFor(offers, 'buyer', 'service'), null);
  const paidFirst = { type: 'record.setup_needed', jobId: '0xdeal', actor: 'platform', ts: 0, payload: { sellerUser: '0xowner', reason: 'deal' } } as unknown as KarwanEvent;
  assert.match(contentFor(paidFirst, 'seller', 'service')!.body, /will not count on your record/);
});

test('the buyer is reminded a day before review ends, with the three choices; the seller is not', () => {
  const ending = { type: 'deal.review.ending', jobId: '0xdeal', actor: 'platform', ts: 0, payload: { buyer: '0xb', seller: '0xs', endsAt: Date.UTC(2026, 9, 27, 9, 0), canAskMoreTime: true } } as unknown as KarwanEvent;
  const mail = contentFor(ending, 'buyer', 'service');
  assert.ok(mail);
  assert.match(mail.subject, /review ends/i);
  assert.match(mail.body, /release/i);
  assert.match(mail.body, /more time/i);
  assert.match(mail.body, /problem/i);
  assert.match(mail.body, /goes to the seller/);
  assert.doesNotMatch(mail.body, /—|escrow/i);
  assert.equal(contentFor(ending, 'seller', 'service'), null);
  const used = { ...ending, payload: { ...ending.payload, canAskMoreTime: false } } as unknown as KarwanEvent;
  assert.doesNotMatch(contentFor(used, 'buyer', 'service')!.body, /more time/i);
});

const deadlineEvent = (type: string, payload: Record<string, unknown>) =>
  ({ type, jobId: '0xdeal', actor: 'platform', ts: 0, payload: { buyer: '0xb', seller: '0xs', ...payload } }) as unknown as KarwanEvent;

test('the seller is reminded before the delivery date; the buyer is not', async () => {
  const soon = deadlineEvent('deal.deadline.soon', { dueAt: Date.UTC(2026, 9, 27, 9, 0), refundAt: Date.UTC(2026, 9, 28, 9, 0) });
  assert.deepEqual(await recipientsFor(soon), [{ address: '0xs', role: 'seller' }]);
  const mail = contentFor(soon, 'seller', 'service');
  assert.ok(mail);
  assert.match(mail.subject, /due 27 Oct, 09:00 UTC/);
  assert.match(mail.body, /ask the buyer for more time/);
  assert.match(mail.body, /28 Oct, 09:00 UTC/);
  assert.doesNotMatch(mail.body, /—|escrow/i);
  assert.equal(contentFor(soon, 'buyer', 'service'), null);
});

test('a missed delivery date reaches both sides with the refund time, and says the money waits on an open request', async () => {
  const refundAt = Date.UTC(2026, 9, 28, 9, 0);
  const passed = deadlineEvent('deal.deadline.passed', { refundAt, askedForMoreTime: false });
  assert.deepEqual(await recipientsFor(passed), [{ address: '0xb', role: 'buyer' }, { address: '0xs', role: 'seller' }]);
  const toBuyer = contentFor(passed, 'buyer', 'service')!;
  assert.match(toBuyer.body, /comes back to you automatically/);
  assert.match(toBuyer.body, /28 Oct, 09:00 UTC/);
  assert.doesNotMatch(toBuyer.body + toBuyer.subject, /reclaim|escrow|—/i);
  const toSeller = contentFor(passed, 'seller', 'service')!;
  assert.match(toSeller.body, /goes back to the buyer/);
  assert.match(toSeller.body, /ask the buyer for more time/);
  const asked = deadlineEvent('deal.deadline.passed', { refundAt, askedForMoreTime: true, additionalSeconds: 2 * 86_400 });
  assert.match(contentFor(asked, 'buyer', 'service')!.body, /2 more days.*stays in the deal until you answer/);
  assert.match(contentFor(asked, 'seller', 'service')!.body, /stays in the deal until they answer/);
});

test('while an answer holds the refund the buyer is reminded each time; the seller hears once', async () => {
  const first = deadlineEvent('deal.extension.waiting', { additionalSeconds: 86_400, reminder: 1 });
  assert.deepEqual(await recipientsFor(first), [{ address: '0xb', role: 'buyer' }, { address: '0xs', role: 'seller' }]);
  assert.match(contentFor(first, 'buyer', 'service')!.body, /1 more day.*decline and your money comes back to you/);
  assert.match(contentFor(first, 'seller', 'service')!.body, /has not answered/);
  const third = deadlineEvent('deal.extension.waiting', { additionalSeconds: 86_400, reminder: 3 });
  assert.deepEqual(await recipientsFor(third), [{ address: '0xb', role: 'buyer' }]);
});

test('a financier whose offer is short hears how much to add', () => {
  const short = {
    type: 'factoring.funding_needed', actor: 'platform', ts: 0,
    payload: { offerId: 'o1', invoiceId: '0xjob', financier: '0xf', shortfallUsdc: '569.03' },
  } as unknown as KarwanEvent;
  const toFinancier = contentFor(short, 'self', 'service');
  assert.ok(toFinancier);
  assert.equal(toFinancier.subject, 'Add 569.03 USDC so the seller can take your offer');
  assert.match(toFinancier.body, /Nothing has moved/);
});
