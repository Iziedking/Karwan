import assert from 'node:assert/strict';
import test from 'node:test';
import { isRequestOwner, offerToChoose } from './chooseOffer.js';

const user = '0x1111111111111111111111111111111111111111';
const agent = '0x2222222222222222222222222222222222222222';
const kofi = '0x3333333333333333333333333333333333333333';

test('the person who posted the request owns it, not their buying agent', () => {
  assert.equal(isRequestOwner(user, { postedBy: user.toUpperCase().replace('0X', '0x') }), true);
  assert.equal(isRequestOwner(agent, { postedBy: user }), false);
  assert.equal(isRequestOwner(user, { postedBy: undefined }), false);
});

test('an offer can be chosen at its own price while the request is still open', () => {
  const bids = [{ seller: kofi, priceUsdc: '240' }];
  assert.deepEqual(offerToChoose(bids, kofi.toUpperCase().replace('0X', '0x'), { funded: false, approved: false, closed: false }), {
    ok: true,
    seller: kofi,
    priceUsdc: '240',
  });
});

test('no choice once the deal is funded, approved, or the seller never offered', () => {
  const bids = [{ seller: kofi, priceUsdc: '240' }];
  assert.equal(offerToChoose(bids, kofi, { funded: true, approved: false, closed: false }).ok, false);
  assert.equal(offerToChoose(bids, kofi, { funded: false, approved: true, closed: false }).ok, false);
  const missing = offerToChoose(bids, agent, { funded: false, approved: false, closed: false });
  assert.equal(missing.ok, false);
  assert.equal(missing.ok === false && missing.code, 'NO_OFFER');
});

test('a request that expired or was cancelled takes no choice', () => {
  const choice = offerToChoose([{ seller: kofi, priceUsdc: '240' }], kofi, { funded: false, approved: false, closed: true });
  assert.equal(choice.ok === false && choice.code, 'CLOSED');
});
