import assert from 'node:assert/strict';
import test from 'node:test';
import { bestAndFinalRecipients, decideOfferRevision, lowestOtherUsdc, rejudgeStep } from './offerRevision.js';

const SELLER = '0x00000000000000000000000000000000000000aa';
const standing = { priceUsdc: '142.71', deadlineUnix: 2_000 };

test('a first offer from a seller is new', () => {
  assert.equal(decideOfferRevision({ seller: SELLER, next: standing }), 'new');
});

test('a lower repeat offer replaces the price', () => {
  assert.equal(decideOfferRevision({ seller: SELLER, standing, next: { priceUsdc: '130', deadlineUnix: 2_000 } }), 'lower-now');
});

test('an equal or higher repeat offer is ignored, so offers only move down', () => {
  assert.equal(decideOfferRevision({ seller: SELLER, standing, next: { priceUsdc: '142.71', deadlineUnix: 2_000 } }), 'ignore');
  assert.equal(decideOfferRevision({ seller: SELLER, standing, next: { priceUsdc: '150', deadlineUnix: 2_000 } }), 'ignore');
});

test('a revision waits while a counter with that seller is open, and not for another seller', () => {
  const next = { priceUsdc: '130', deadlineUnix: 2_000 };
  assert.equal(decideOfferRevision({ seller: SELLER, standing, next, counterOpenWith: SELLER.toUpperCase().replace('0X', '0x') }), 'lower-after-counter');
  assert.equal(decideOfferRevision({ seller: SELLER, standing, next, counterOpenWith: '0x00000000000000000000000000000000000000bb' }), 'lower-now');
});

test('an edit makes the agent look again at the offers it holds, unless the request is past that', () => {
  const open = { finalized: false, escrowFunded: false, expired: false, nearMissPending: false, counterInFlight: false, offers: 3 };
  assert.equal(rejudgeStep(open), 'rejudge');
  assert.equal(rejudgeStep({ ...open, finalized: true }), 'skip');
  assert.equal(rejudgeStep({ ...open, escrowFunded: true }), 'skip');
  assert.equal(rejudgeStep({ ...open, expired: true }), 'skip');
  assert.equal(rejudgeStep({ ...open, nearMissPending: true }), 'skip', 'the buyer is already being asked');
  assert.equal(rejudgeStep({ ...open, offers: 0 }), 'skip', 'nothing to look at yet; new offers arrive on their own');
});

test('two edits in a row never send two counters to one seller', () => {
  const open = { finalized: false, escrowFunded: false, expired: false, nearMissPending: false, counterInFlight: false, offers: 3 };
  assert.equal(rejudgeStep(open), 'rejudge');
  assert.equal(rejudgeStep({ ...open, counterInFlight: true }), 'rank-only', 'the list is ranked again, the open counter is left alone');
});

test('best and final goes to the sellers whose offer is not the lowest, with no prices in it', () => {
  const offers = [
    { seller: '0xA', priceUsdc: '118' },
    { seller: '0xB', priceUsdc: '100' },
    { seller: '0xC', priceUsdc: '142.71' },
  ];
  assert.deepEqual(bestAndFinalRecipients(offers).sort(), ['0xA', '0xC']);
  assert.deepEqual(bestAndFinalRecipients([{ seller: '0xA', priceUsdc: '90' }]), [], 'one offer has nobody to beat');
  assert.deepEqual(bestAndFinalRecipients([{ seller: '0xA', priceUsdc: '90' }, { seller: '0xB', priceUsdc: '90' }]), [], 'a tie is already the lowest');
});

test('each seller is measured against the lowest offer other than their own', () => {
  const offers = [{ seller: '0xA', priceUsdc: '118' }, { seller: '0xB', priceUsdc: '100' }];
  assert.equal(lowestOtherUsdc(offers, '0xa'), 100);
  assert.equal(lowestOtherUsdc(offers, '0xB'), 118);
  assert.equal(lowestOtherUsdc([{ seller: '0xA', priceUsdc: '90' }], '0xA'), null);
});

test('a seller who withdrew is never taken back by a later offer', () => {
  assert.equal(decideOfferRevision({ seller: SELLER, next: { priceUsdc: '90', deadlineUnix: 2_000 }, withdrawn: true }), 'ignore');
});
