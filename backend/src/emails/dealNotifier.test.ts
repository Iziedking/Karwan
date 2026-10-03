import assert from 'node:assert/strict';
import test from 'node:test';
import { amountFor, contentFor } from './dealNotifier.js';
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
