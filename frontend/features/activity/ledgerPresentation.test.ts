import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ledgerAmountLabel,
  ledgerDirection,
  ledgerReferenceLabel,
  ledgerRowText,
  ledgerLine,
  ledgerStatusTone,
  displayUsdc,
  filterByDirection,
  groupByDay,
  ledgerTitle,
  ledgerContext,
} from './ledgerPresentation';
import { readableMovementText } from './receiptPresentation';

test('keeps the complete durable reference for support and receipts', () => {
  assert.equal(ledgerReferenceLabel(' KWN-2345-ABCD-EFGH '), 'KWN-2345-ABCD-EFGH');
  assert.equal(ledgerReferenceLabel(''), null);
  assert.equal(ledgerReferenceLabel(null), null);
});

test('maps ledger state into presentation tone without inventing states', () => {
  assert.equal(ledgerStatusTone('done'), 'positive');
  assert.equal(ledgerStatusTone('pending'), 'pending');
  assert.equal(ledgerStatusTone('failed'), 'failed');
});

test('signs a ledger amount by the direction of its kind', () => {
  assert.equal(ledgerAmountLabel('1200.00', 'payout'), '+1,200.00 USDC');
  assert.equal(ledgerAmountLabel('1200.00', 'release'), '-1,200.00 USDC');
  assert.equal(ledgerAmountLabel(' 40.5 ', 'deposit'), '+40.50 USDC');
});

test('shows an unrecognised kind without a sign rather than guessing', () => {
  assert.equal(ledgerDirection('something_new'), 'flat');
  assert.equal(ledgerAmountLabel('9.00', 'something_new'), '9.00 USDC');
});

test('renders nothing when a row carries no amount', () => {
  assert.equal(ledgerAmountLabel(null, 'payout'), null);
  assert.equal(ledgerAmountLabel('', 'release'), null);
  assert.equal(ledgerAmountLabel('   ', 'release'), null);
});

test('a Karwan seed is money arriving, not leaving', () => {
  // The first two rows of every new account were "-0.5 USDC": Karwan funding
  // the agent wallets was classified as the user spending.
  assert.equal(ledgerDirection('agent_seed'), 'in');
  assert.equal(ledgerAmountLabel('0.5', 'agent_seed'), '+0.50 USDC');
  // A top up is the user's own money moving out of the sign-in wallet.
  assert.equal(ledgerAmountLabel('100', 'agent_topup'), '-100.00 USDC');
});

test('a financier repayment is money arriving', () => {
  assert.equal(ledgerDirection('financing_repaid'), 'in');
  assert.equal(ledgerAmountLabel('200', 'financing_repaid'), '+200.00 USDC');
});

test('a ledger row reads in the reader\'s language when the backend named a template', () => {
  const texts = { agentTopUp: 'Added {amount} USDC to the {agent} trade account from the main account' };
  assert.equal(
    ledgerLine({ summary: 'Topped up the buyer agent wallet with 5 USDC', params: { t: 'agentTopUp', amount: '5', agent: 'buyer' } }, texts),
    'Added 5 USDC to the buyer trade account from the main account',
  );
});

test('a ledger row without a known template falls back to its recorded sentence', () => {
  const summary = 'Withdrew 5 USDC from the buyer agent wallet to 0x1234567890abcdef1234567890abcdef12345678';
  assert.equal(ledgerLine({ summary, params: null }, {}), readableMovementText(summary));
  assert.equal(ledgerLine({ summary, params: { t: 'missing' } }, {}), readableMovementText(summary));
});

test('a long recipient in a template is not printed raw', () => {
  const texts = { agentWithdraw: 'Moved {amount} USDC from the {agent} trade account to {to}' };
  assert.equal(
    ledgerLine({ summary: 'x', params: { t: 'agentWithdraw', amount: '5', agent: 'seller', to: '0x1234567890abcdef1234567890abcdef12345678' } }, texts),
    'Moved 5 USDC from the seller trade account to counterparty',
  );
});

test('a ledger row reads in plain words and to the cent, while small amounts keep their digits', () => {
  assert.equal(ledgerRowText('Observed 9.954921 USDC arrive in your identity wallet'), 'Received 9.95 USDC in your wallet');
  assert.equal(ledgerRowText('Observed 109.545475 USDC leave your buyer agent wallet'), 'Sent 109.55 USDC from your buyer trade account');
  assert.equal(ledgerRowText('Observed 200 USDC move into your seller agent wallet'), 'Moved 200 USDC into your seller trade account');
  assert.equal(ledgerRowText('Funded the buyer agent wallet with 161.32 USDC from the identity wallet'), 'Funded the buyer trade account with 161.32 USDC from your wallet');
  assert.equal(ledgerAmountLabel('109.545475', 'cash_out'), '-109.55 USDC');
  assert.equal(ledgerAmountLabel('0.043785', 'deposit'), '+0.0438 USDC');
  assert.equal(ledgerAmountLabel('0.007', 'agent_spend'), '-0.007 USDC');
});

test('escrow funding and a bridge out are money leaving the account', () => {
  assert.equal(ledgerDirection('escrow_funding'), 'out');
  assert.equal(ledgerDirection('bridge'), 'out');
});

test('every amount on the statement has the same shape: cents, grouped thousands', () => {
  // "20" and "19.997" sat in one list as "20" and "20.00".
  assert.equal(displayUsdc('20'), '20.00');
  assert.equal(displayUsdc('19.997'), '20.00');
  assert.equal(displayUsdc('1200'), '1,200.00');
  assert.equal(displayUsdc('0.5'), '0.50');
  // Under 1 USDC a fee keeps up to four places so it never reads as zero.
  assert.equal(displayUsdc('0.043785'), '0.0438');
  assert.equal(displayUsdc('0.007'), '0.007');
  assert.equal(displayUsdc('not a number'), 'not a number');
});

test('money arriving in a trade account reads as received, not moved', () => {
  assert.equal(
    readableMovementText('Observed 20 USDC arrive in your buyer agent wallet'),
    'Received 20 USDC in your buyer trade account',
  );
  assert.equal(
    readableMovementText('Observed 200 USDC move into your seller agent wallet'),
    'Moved 200 USDC into your seller trade account',
  );
});

test('the statement filter splits money in from money out and keeps unknown kinds under all only', () => {
  const items = [{ kind: 'deposit' }, { kind: 'cash_out' }, { kind: 'something_new' }, { kind: 'payout' }];
  assert.deepEqual(filterByDirection(items, 'all'), items);
  assert.deepEqual(filterByDirection(items, 'in').map((i) => i.kind), ['deposit', 'payout']);
  assert.deepEqual(filterByDirection(items, 'out').map((i) => i.kind), ['cash_out']);
});

test('rows group under their calendar day, newest first, with today and yesterday named', () => {
  const now = new Date(2026, 9, 15, 9, 0).getTime();
  const rows = [
    { ts: new Date(2026, 9, 15, 8, 30).getTime(), id: 'a' },
    { ts: new Date(2026, 9, 15, 0, 5).getTime(), id: 'b' },
    { ts: new Date(2026, 9, 14, 23, 59).getTime(), id: 'c' },
    { ts: new Date(2026, 9, 12, 12, 0).getTime(), id: 'd' },
  ];
  const groups = groupByDay(rows, (row) => row.ts, now);
  assert.deepEqual(groups.map((g) => g.day), ['today', 'yesterday', 'date']);
  assert.deepEqual(groups.map((g) => g.rows.map((r) => r.id)), [['a', 'b'], ['c'], ['d']]);
  assert.equal(new Date(groups[2].start).getDate(), 12);
});

test('a row is titled by what happened, and says the amount only once', () => {
  const titles = { deposit: 'Deposit', transfer_out: 'Sent' };
  assert.equal(ledgerTitle({ kind: 'deposit', summary: 'Observed 20 USDC arrive in your buyer agent wallet' }, titles, {}), 'Deposit');
  // A kind with no title keeps its sentence rather than going blank.
  assert.equal(
    ledgerTitle({ kind: 'something_new', summary: 'Earned 1.41 USDC of staking yield' }, titles, {}),
    'Earned 1.41 USDC of staking yield',
  );
});

test('a row names the other side when the record carries it, and nothing raw', () => {
  assert.equal(ledgerContext({ params: { t: 'sent', who: '@ada' } }), '@ada');
  assert.equal(ledgerContext({ params: { t: 'bridgeIn', chain: 'baseSepolia' } }), 'Base Sepolia');
  assert.equal(ledgerContext({ params: { t: 'dealPayout', job: 'KW-12AB' } }), 'KW-12AB');
  assert.equal(ledgerContext({ params: { t: 'x', who: '0x1234567890abcdef1234567890abcdef12345678' } }), null);
  // The record can already hold a shortened address; that is still an address.
  assert.equal(ledgerContext({ params: { t: 'sent', who: '0x64a5…7d21' } }), null);
  assert.equal(ledgerContext({ params: { t: 'sent', who: '0x64a5' } }), null);
  assert.equal(ledgerContext({ params: null }), null);
});

test('money the escrow paid your financier from your deal is a note: no sign, in neither filter', () => {
  assert.equal(ledgerDirection('financing_paid_from_deal'), 'flat');
  assert.equal(ledgerAmountLabel('992.5', 'financing_paid_from_deal'), '992.50 USDC');
  assert.deepEqual(filterByDirection([{ kind: 'financing_paid_from_deal' }], 'in'), []);
});
