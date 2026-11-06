import assert from 'node:assert/strict';
import test from 'node:test';
import { isDraftCaption, isOfferCaption } from './offerCaption.js';

test('words about selling make the photo an offer photo', () => {
  assert.equal(isOfferCaption('selling this for 50 USDC'), true);
  assert.equal(isOfferCaption('For my offer'), true);
  assert.equal(isOfferCaption('put it up for sale'), true);
});

test('anything else is not an offer photo', () => {
  assert.equal(isOfferCaption('what is this?'), false);
  assert.equal(isOfferCaption(''), false);
  assert.equal(isOfferCaption('my invoice for October'), false);
});

test('words about a request or a deal keep a photo or PDF for it, the same rule as chat (view 56)', () => {
  for (const words of ['for my request', 'I need shelves like this', 'this is what we agreed']) assert.equal(isDraftCaption(words), true, words);
  for (const words of ['my invoice for June', 'receipt for the deal', '', 'what is this?']) assert.equal(isDraftCaption(words), false, words);
});
