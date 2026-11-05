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

test('the delivery date speaks to each side, and an open request holds the money', () => {
  assert.match(summaryFor('deal.deadline.soon', {}, 'seller', en), /due soon.*ask the buyer for more time/);
  assert.match(summaryFor('deal.deadline.passed', { askedForMoreTime: false }, 'buyer', en), /comes back to you/);
  assert.match(summaryFor('deal.deadline.passed', { askedForMoreTime: false }, 'seller', en), /goes back to the buyer/);
  assert.match(summaryFor('deal.deadline.passed', { askedForMoreTime: true }, 'buyer', en), /stays in the deal until you do/);
  assert.match(summaryFor('deal.deadline.passed', { askedForMoreTime: true }, 'seller', en), /with the buyer/);
  assert.match(summaryFor('deal.extension.waiting', { reminder: 2 }, 'buyer', en), /waiting for your answer/);
  assert.match(summaryFor('deal.extension.waiting', { reminder: 1 }, 'seller', en), /has not answered/);
  assert.match(summaryFor('deal.review.ending', {}, 'buyer', en), /review ends soon.*goes to the seller/);
  for (const locale of ['ar', 'fr', 'hi', 'sw'] as const) {
    for (const [type, role] of [['deal.deadline.soon', 'seller'], ['deal.deadline.passed', 'buyer'], ['deal.extension.waiting', 'buyer']] as const) {
      assert.notEqual(summaryFor(type, {}, role, notifyCopy[locale]), summaryFor(type, {}, role, en), `${type} ${locale}`);
    }
  }
  for (const line of Object.values(en)) if (typeof line === 'string') assert.doesNotMatch(line, /Reclaim your funds/);
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

test('a question from the agent says so, and that nothing is sent until they answer (view 41)', () => {
  assert.equal(
    summaryFor('agent.suggestion', { questionId: 'q1', kind: 'no-way', title: '3 pairs of Clark shoes' }, 'seller', en),
    'Your agent has a question about 3 pairs of Clark shoes. Nothing is sent until you answer.',
  );
  assert.equal(summaryFor('agent.suggestion', { questionId: 'q1', kind: 'no-way' }, 'seller', en), en.agentQuestion);
});

test('a seller asked to set up their record reads why, in the bell', () => {
  assert.equal(summaryFor('record.setup_needed', { reason: 'offers' }, 'seller', en), en.recordNeededOffers);
  assert.equal(summaryFor('record.setup_needed', { reason: 'deal' }, 'seller', en), en.recordNeededDeal);
  assert.match(en.recordNeededOffers, /Karwan record/);
});

test('a financier whose offer is short is told how much to add', () => {
  assert.equal(
    summaryFor('factoring.funding_needed', { shortfallUsdc: '569.03' }, 'financier', en),
    'A seller tried to take your offer. Add 569.03 USDC so they can.',
  );
});

test('a financier paying from their own wallet is told the seller took their offer, with the amount', () => {
  assert.equal(
    summaryFor('factoring.awaiting_financier', { advanceUsdc: '185' }, 'financier', en),
    'The seller took your offer. Pay them 185 USDC within 24 hours.',
  );
});

test('an agent topping up its data balance says the money moved, and the weekly line gives the price and what is left (view 48)', () => {
  assert.equal(
    summaryFor('wallet.debited', { amountUsdc: '0.100000', walletRole: 'sellerAgent', toDataBalance: true }, 'seller', en),
    "0.1 USDC moved to your selling agent's data balance.",
  );
  assert.equal(
    summaryFor('agent.weekly', { totalUsdc: 0.01, recordChecks: 2, webSearches: 0, checkPriceUsdc: 0.005, dataBalanceUsdc: 0.084 }, null, en),
    'Your agents spent 0.01 USDC on data this week: 2 record checks at 0.005 USDC each and 0 web searches. 0.084 USDC is left in their data balance.',
  );
});


test('research the agent paid for that did not finish says so, with the amount when one was spent (view 52, step 0)', () => {
  assert.equal(
    summaryFor('agent.research.failed', { title: 'Logo design' }, null, en),
    "Research for Logo design didn't finish. Your agent carried on with Karwan's own prices.",
  );
  assert.equal(
    summaryFor('agent.research.failed', { title: 'Logo design', amountUsd: 0.009 }, null, en),
    "Research for Logo design didn't finish, and 0.009 USDC was spent on it. Your agent carried on with Karwan's own prices.",
  );
  assert.equal(summaryFor('agent.research.failed', {}, null, en), "Research for your request didn't finish. Your agent carried on with Karwan's own prices.");
});

test('the weekly line says how many things the agent has to tell, and drops the spend line when nothing was spent (view 52, step 1)', () => {
  assert.equal(
    summaryFor('agent.weekly', { totalUsdc: 0, recordChecks: 0, webSearches: 0, insights: [{ kind: 'missed-by-price' }, { kind: 'slow-request' }] }, null, en),
    'Your agent has 2 things to tell you about how you trade. Ask it what it sees.',
  );
  assert.equal(
    summaryFor('agent.weekly', { totalUsdc: 0.005, recordChecks: 1, webSearches: 0, checkPriceUsdc: 0.005, insights: [{ kind: 'missed-by-price' }] }, null, en),
    'Your agents spent 0.005 USDC on data this week: 1 record checks at 0.005 USDC each and 0 web searches. Your agent has one thing to tell you about how you trade. Ask it what it sees.',
  );
});

test('a question nobody answered in time says the agent declined politely (view 52, step 2)', () => {
  assert.equal(
    summaryFor('agent.question.decided', { title: 'Logo', choice: 'no' }, 'seller', en),
    "You didn't answer about Logo, so your agent declined politely. You can still make an offer from the request page.",
  );
});

test('the weekly line counts the questions and how they ended', () => {
  assert.equal(
    summaryFor('agent.weekly', { totalUsdc: 0, questions: { asked: 4, answered: 1, byDefault: 3 } }, null, en),
    'Your agent asked you 4 questions: you answered 1, and 3 went its stated way with no answer.',
  );
});
