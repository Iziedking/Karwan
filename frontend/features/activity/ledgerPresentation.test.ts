import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ledgerAmountLabel,
  ledgerDirection,
  ledgerReferenceLabel,
  ledgerLine,
  ledgerStatusTone,
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
  assert.equal(ledgerAmountLabel('1200.00', 'payout'), '+1200.00 USDC');
  assert.equal(ledgerAmountLabel('1200.00', 'release'), '-1200.00 USDC');
  assert.equal(ledgerAmountLabel(' 40.5 ', 'deposit'), '+40.5 USDC');
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
  assert.equal(ledgerAmountLabel('0.5', 'agent_seed'), '+0.5 USDC');
  // A top up is the user's own money moving out of the sign-in wallet.
  assert.equal(ledgerAmountLabel('100', 'agent_topup'), '-100 USDC');
});

test('a financier repayment is money arriving', () => {
  assert.equal(ledgerDirection('financing_repaid'), 'in');
  assert.equal(ledgerAmountLabel('200', 'financing_repaid'), '+200 USDC');
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
