import assert from 'node:assert/strict';
import test from 'node:test';
import { isOfferCaption } from './offerCaption.js';

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
