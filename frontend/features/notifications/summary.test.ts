import assert from 'node:assert/strict';
import test from 'node:test';
import { notifyCopy } from '@/shared/i18n/messages/notifications';
import { summaryFor } from './summary';

const en = notifyCopy.en;

test('a dispute says what can still happen, never that it is handled off-platform', () => {
  const line = summaryFor('deal.disputed', {}, 'buyer', en);
  assert.match(line, /Either side can still propose a cancel/);
  assert.doesNotMatch(line, /off-platform/);
});

test('the seller is told to send the right link when the check holds their delivery', () => {
  assert.equal(
    summaryFor('deal.release.blocked', { detail: 'off-request' }, 'seller', en),
    'Payment is paused: the check found your delivery may not match the request. Send the right link. The money stays in escrow.',
  );
});

test('amounts fill in, and a missing amount falls back to a whole sentence', () => {
  assert.equal(summaryFor('deal.matched', { agreedPriceUsdc: '200' }, 'buyer', en), 'Your agent found a match at 200 USDC. Tap to review.');
  assert.equal(summaryFor('deal.matched', {}, 'buyer', en), 'Your agent found a match. Tap to review.');
  assert.equal(summaryFor('wallet.credited', { amountUsdc: '198.500000', walletRole: 'sellerAgent' }, 'seller', en), '198.5 USDC arrived in your selling agent.');
});

test('every language has a line for the same event, and the bell speaks it', () => {
  for (const locale of ['ar', 'fr', 'hi', 'sw'] as const) {
    const line = summaryFor('deal.disputed', {}, 'buyer', notifyCopy[locale]);
    assert.ok(line.length > 10 && line !== en.disputed, locale);
  }
});

test('a bell amount reads to the cent, and a small one keeps its digits', () => {
  assert.equal(summaryFor('wallet.credited', { amountUsdc: '9.954921', walletRole: 'identity' }, 'buyer', en), '9.95 USDC arrived in your balance.');
  // Money that lands on another chain is on its way; the bridge says when it is in the balance.
  assert.equal(summaryFor('wallet.credited', { amountUsdc: '20', chain: 'BASE-SEPOLIA', chainName: 'Base', bridgeId: 'deposit-1', source: 'deposit' }, 'buyer', en), '20 USDC arrived on Base. Moving it to your balance.');
  assert.equal(summaryFor('wallet.credited', { amountUsdc: '0.043785', walletRole: 'identity' }, 'buyer', en), '0.0438 USDC arrived in your balance.');
});

test('an extension ask tells the buyer how many days and what to do', () => {
  assert.equal(summaryFor('deal.extension.requested', { additionalSeconds: 3 * 86_400 }, 'buyer', en), 'The seller asked for 3 more days to deliver. Approve or decline on the deal.');
  assert.equal(summaryFor('deal.extension.requested', { additionalSeconds: 86_400 }, 'buyer', en), 'The seller asked for 1 more day to deliver. Approve or decline on the deal.');
  assert.match(summaryFor('deal.extension.approved', {}, 'seller', en), /gave you more time/);
  assert.match(summaryFor('deal.extension.declined', {}, 'seller', en), /kept the deadline/);
});

test('a dispute statement prompts the side that still owes one', () => {
  assert.match(summaryFor('deal.dispute.statement', { side: 'buyer' }, 'seller', en), /^The buyer gave their account.*Give yours/);
  assert.match(summaryFor('deal.dispute.statement', { side: 'seller' }, 'buyer', en), /^The seller gave their account/);
  assert.match(summaryFor('deal.dispute.statement.due', { side: 'buyer' }, 'buyer', en), /still missing/);
  for (const locale of ['ar', 'fr', 'hi', 'sw'] as const) {
    assert.notEqual(summaryFor('deal.dispute.statement.due', { side: 'buyer' }, 'buyer', notifyCopy[locale]), en.statementDue, locale);
  }
});

test('money notes name the wallet by its role, with no plus or minus sign', () => {
  // Older events carry an internal label; the role decides the words.
  assert.equal(summaryFor('wallet.credited', { amountUsdc: '20', walletRole: 'identity', walletLabel: 'identity wallet' }, 'buyer', en), '20 USDC arrived in your balance.');
  assert.equal(summaryFor('wallet.debited', { amountUsdc: '5', walletRole: 'buyerAgent', walletLabel: 'buyer agent wallet' }, 'buyer', en), '5 USDC left your buying agent.');
  for (const copy of Object.values(notifyCopy)) {
    assert.doesNotMatch(copy.credited + copy.debited, /^[+-]|identity/);
  }
});

test('ask me first says the agent found a request and asks for an offer', () => {
  assert.equal(
    summaryFor('agent.suggestion', { title: 'Logo for a bakery', priceUsdc: '35.00' }, 'seller', en),
    'Your agent found a request that fits: Logo for a bakery. Make an offer?',
  );
  assert.equal(summaryFor('agent.suggestion', {}, 'seller', en), 'Your agent found a request that fits. Make an offer?');
});

test('a seller asked to set up their record reads why, in the bell', () => {
  assert.equal(summaryFor('record.setup_needed', { reason: 'offers' }, 'seller', en), en.recordNeededOffers);
  assert.equal(summaryFor('record.setup_needed', { reason: 'deal' }, 'seller', en), en.recordNeededDeal);
  assert.match(en.recordNeededOffers, /Karwan record/);
});

test('buyer silence reads plainly in the bell for each side', () => {
  assert.equal(summaryFor('deal.buyer_silent', { stage: 'prompt' }, 'seller', en), en.buyerSilentPrompt);
  assert.equal(summaryFor('deal.buyer_silent', { stage: 'raised', by: 'agent' }, 'seller', en), en.buyerSilentRaised);
  assert.equal(summaryFor('deal.buyer_silent', { stage: 'answer' }, 'buyer', en), en.buyerSilentAnswer);
});

test('a financier whose offer is short is told how much to add', () => {
  assert.equal(
    summaryFor('factoring.funding_needed', { shortfallUsdc: '569.03' }, 'financier', en),
    'A seller tried to take your offer. Add 569.03 USDC so they can.',
  );
});
