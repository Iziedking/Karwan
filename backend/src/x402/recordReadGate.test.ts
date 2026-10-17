import assert from 'node:assert/strict';
import test from 'node:test';
import { inMarketReader, isPartyToRequest, recordReadGate } from './recordReadGate.js';

const ok = { subjectExists: true, readerAccount: '0xr', payerIsReadersAgent: true, readerIsPartyToRef: true };

test('passes when every check holds', () => assert.deepEqual(recordReadGate(ok), { ok: true }));
test('unknown subject is 404', () => {
  const r = recordReadGate({ ...ok, subjectExists: false });
  assert.equal(!r.ok && r.status, 404);
});
test('a poster, bidder or listing seller is readable by the agent of someone on that request, no switch needed', () => {
  assert.deepEqual(recordReadGate({ subjectExists: true, readerAccount: '0xr', payerIsReadersAgent: true, readerIsPartyToRef: true }), { ok: true });
});
test('a person on no request cannot be read even with in-market reads on', () => {
  const r = recordReadGate({ ...ok, readerIsPartyToRef: false });
  assert.equal(!r.ok && r.status, 403);
});
test('the payer must be the reader account agent', () => assert.equal(recordReadGate({ ...ok, payerIsReadersAgent: false }).ok, false));
test('the reader must be party to the request', () => assert.equal(recordReadGate({ ...ok, readerIsPartyToRef: false }).ok, false));

const BUYER = '0xb';
const SELLER = '0xs';
const STRANGER = '0xz';

test('a buyer may read a seller who bid on their request', () => {
  assert.equal(isPartyToRequest({ purpose: 'shortlist', reader: BUYER, subject: SELLER }, { briefPoster: BUYER, subjectBid: true, listingSeller: null, briefOpen: true, listingLive: false }), true);
  assert.equal(isPartyToRequest({ purpose: 'shortlist', reader: BUYER, subject: SELLER }, { briefPoster: BUYER, subjectBid: false, listingSeller: null, briefOpen: true, listingLive: false }), false);
  assert.equal(isPartyToRequest({ purpose: 'shortlist', reader: STRANGER, subject: SELLER }, { briefPoster: BUYER, subjectBid: true, listingSeller: null, briefOpen: true, listingLive: false }), false);
});

test('a seller may read the buyer of an open request before bidding', () => {
  assert.equal(isPartyToRequest({ purpose: 'bid', reader: SELLER, subject: BUYER }, { briefPoster: BUYER, subjectBid: false, listingSeller: null, briefOpen: true, listingLive: false }), true);
  assert.equal(isPartyToRequest({ purpose: 'bid', reader: SELLER, subject: STRANGER }, { briefPoster: BUYER, subjectBid: false, listingSeller: null, briefOpen: true, listingLive: false }), false);
  assert.equal(isPartyToRequest({ purpose: 'bid', reader: BUYER, subject: BUYER }, { briefPoster: BUYER, subjectBid: false, listingSeller: null, briefOpen: true, listingLive: false }), false);
});

test('anyone but the seller may read the seller behind a listing they ask about', () => {
  assert.equal(isPartyToRequest({ purpose: 'question', reader: BUYER, subject: SELLER }, { briefPoster: null, subjectBid: false, listingSeller: SELLER, briefOpen: false, listingLive: true }), true);
  assert.equal(isPartyToRequest({ purpose: 'question', reader: SELLER, subject: SELLER }, { briefPoster: null, subjectBid: false, listingSeller: SELLER, briefOpen: false, listingLive: true }), false);
  assert.equal(isPartyToRequest({ purpose: 'question', reader: BUYER, subject: STRANGER }, { briefPoster: null, subjectBid: false, listingSeller: SELLER, briefOpen: false, listingLive: true }), false);
});

const header = (payload: Record<string, unknown>) => Buffer.from(JSON.stringify({ x402Version: 2, payload })).toString('base64');

test('the payer named in a payment signature is read from its authorization', async () => {
  const { signedPayer } = await import('./recordReadGate.js');
  assert.equal(signedPayer(header({ authorization: { from: '0xABC' } })), '0xabc');
  assert.equal(signedPayer(undefined), null);
  assert.equal(signedPayer('not base64 json'), null);
  assert.equal(signedPayer(header({})), null);
});

test('a paid retry from a wallet other than the named account is refused before settlement', async () => {
  const { paymentFromReader } = await import('./recordReadGate.js');
  assert.equal(paymentFromReader(undefined, '0xabc'), true);
  assert.equal(paymentFromReader(header({ authorization: { from: '0xabc' } }), '0xABC'), true);
  assert.equal(paymentFromReader(header({ authorization: { from: '0xdef' } }), '0xabc'), false);
  assert.equal(paymentFromReader(header({ authorization: { from: '0xabc' } }), undefined), false);
});

test('a seller can read a buyer only while the request is open', () => {
  assert.equal(isPartyToRequest({ purpose: 'bid', reader: SELLER, subject: BUYER }, { briefPoster: BUYER, subjectBid: false, listingSeller: null, briefOpen: false, listingLive: false }), false);
});

test('a listing seller can be read only while the listing is live', () => {
  assert.equal(isPartyToRequest({ purpose: 'question', reader: BUYER, subject: SELLER }, { briefPoster: null, subjectBid: false, listingSeller: SELLER, briefOpen: false, listingLive: false }), false);
});

test('a Karwan agent on the named request is an in-market reader; anyone else is not', () => {
  const facts = { briefPoster: BUYER, subjectBid: true, listingSeller: null, briefOpen: true, listingLive: false };
  assert.equal(inMarketReader({ readerAccount: BUYER, payerIsReadersAgent: true, subject: SELLER }, facts), true);
  assert.equal(inMarketReader({ readerAccount: SELLER, payerIsReadersAgent: true, subject: BUYER }, facts), true);
  assert.equal(inMarketReader({ readerAccount: STRANGER, payerIsReadersAgent: true, subject: SELLER }, facts), false);
  assert.equal(inMarketReader({ readerAccount: BUYER, payerIsReadersAgent: false, subject: SELLER }, facts), false);
  assert.equal(inMarketReader({ readerAccount: null, payerIsReadersAgent: true, subject: SELLER }, facts), false);
});
