import assert from 'node:assert/strict';
import test from 'node:test';
import { decideTrust, mentionsGithubDelivery, TRUST_LIMITS, trustForViewer, unionSubject, verifySubject, type PartyFacts } from './riskEngine.js';

const seasoned: PartyFacts = { settledDeals: 4, worldIdPassed: true, lostDisputes: 0, dealsLastDay: 1, accountAgeDays: 90, linkOffenses: 0 };
const newcomer: PartyFacts = { settledDeals: 0, worldIdPassed: false, lostDisputes: 0, dealsLastDay: 0, accountAgeDays: 1, linkOffenses: 0 };
const deal = { amountUsdc: 120, priceZ: 0.4, githubDelivery: false };

test('two seasoned people on a small deal: escrow only', () => {
  const d = decideTrust({ buyer: seasoned, seller: seasoned, deal, worldIdAvailable: true, now: 1 });
  assert.equal(d.level, 'clear');
  assert.deepEqual(d.verify, {});
  assert.equal(d.stakeRequired, false);
  assert.equal(verifySubject(d), null);
});

test('a first deal asks that person once, and a World ID pass on an earlier deal counts', () => {
  const d = decideTrust({ buyer: seasoned, seller: newcomer, deal, worldIdAvailable: true });
  assert.deepEqual(d.verify, { seller: 'first_deal' });
  assert.equal(verifySubject(d), 'seller');
  const passedBefore = decideTrust({ buyer: seasoned, seller: { ...newcomer, worldIdPassed: true }, deal, worldIdAvailable: true });
  assert.deepEqual(passedBefore.verify, {});
});

test('large deals ask both sides, whatever their history', () => {
  const d = decideTrust({ buyer: seasoned, seller: seasoned, deal: { ...deal, amountUsdc: TRUST_LIMITS.largeDealUsdc }, worldIdAvailable: true });
  assert.deepEqual(d.verify, { buyer: 'large_deal', seller: 'large_deal' });
  assert.equal(d.level, 'step_up');
});

test('a new account opening many deals in a day is asked again', () => {
  const fast = { ...seasoned, accountAgeDays: 2, dealsLastDay: TRUST_LIMITS.fastDeals };
  assert.deepEqual(decideTrust({ buyer: fast, seller: seasoned, deal, worldIdAvailable: true }).verify, { buyer: 'fast_new_account' });
  const oldAndBusy = { ...fast, accountAgeDays: 60 };
  assert.deepEqual(decideTrust({ buyer: oldAndBusy, seller: seasoned, deal, worldIdAvailable: true }).verify, {});
});

test('a flagged link on record steps the person up', () => {
  const d = decideTrust({ buyer: seasoned, seller: { ...seasoned, linkOffenses: 1 }, deal, worldIdAvailable: true });
  assert.deepEqual(d.verify, { seller: 'flagged_link_before' });
});

test('two lost disputes make the seller hold stake; a buyer loss does not', () => {
  const d = decideTrust({ buyer: seasoned, seller: { ...seasoned, lostDisputes: 2 }, deal, worldIdAvailable: true });
  assert.equal(d.stakeRequired, true);
  assert.equal(d.level, 'step_up');
  assert.equal(decideTrust({ buyer: { ...seasoned, lostDisputes: 3 }, seller: seasoned, deal, worldIdAvailable: true }).stakeRequired, false);
});

test('an off-market price is noted, never blocked', () => {
  const d = decideTrust({ buyer: seasoned, seller: seasoned, deal: { ...deal, priceZ: -4 }, worldIdAvailable: true });
  assert.equal(d.level, 'watch');
  assert.deepEqual(d.verify, {});
  assert.deepEqual(d.reasons, [{ code: 'off_market_price' }]);
});

test('without World ID configured nobody is asked, but the reasons are kept', () => {
  const d = decideTrust({ buyer: newcomer, seller: newcomer, deal, worldIdAvailable: false });
  assert.deepEqual(d.verify, {});
  assert.equal(d.reasons.length, 2);
  assert.equal(d.level, 'watch');
});

test('an invited seller is decided later, when known', () => {
  const d = decideTrust({ buyer: seasoned, seller: null, deal, worldIdAvailable: true });
  assert.deepEqual(d.verify, {});
});

test('a later decision can add a party but never drop one', () => {
  assert.equal(unionSubject('seller', 'buyer'), 'both');
  assert.equal(unionSubject('both', null), 'both');
  assert.equal(unionSubject(null, undefined), null);
  assert.equal(unionSubject(undefined, 'seller'), 'seller');
});

test('GitHub delivery is read from the agreement', () => {
  assert.equal(mentionsGithubDelivery('Deliver to github.com/acme/shop as a pull request'), true);
  assert.equal(mentionsGithubDelivery('Code in a GitHub repo with tests'), true);
  assert.equal(mentionsGithubDelivery('My GitHub profile shows my past work'), false);
  assert.equal(mentionsGithubDelivery('Logo in SVG and PNG'), false);
});

test('each side reads its own reasons; the other side only sees that a check is asked', () => {
  const d = decideTrust({
    buyer: newcomer,
    seller: { ...seasoned, linkOffenses: 1, lostDisputes: 2 },
    deal: { ...deal, priceZ: 5 },
    worldIdAvailable: true,
  });
  const buyerView = trustForViewer(d, 'buyer');
  assert.deepEqual(buyerView.verify, { buyer: 'first_deal', seller: 'check' });
  assert.deepEqual(buyerView.reasons, ['first_deal', 'off_market_price']);
  assert.equal(buyerView.stakeRequired, true);
  const sellerView = trustForViewer(d, 'seller');
  assert.deepEqual(sellerView.verify, { buyer: 'first_deal', seller: 'flagged_link_before' });
  assert.deepEqual(sellerView.reasons, ['flagged_link_before', 'lost_disputes', 'off_market_price']);
});
