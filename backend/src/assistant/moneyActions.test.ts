import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCancelMoneyMoveConfirm,
  buildPauseMoneyOutConfirm,
  buildPayPaymentLinkConfirm,
  buildRecheckMoneyMoveConfirm,
  buildRecheckPayoutConfirm,
  buildRemovePayoutAddressConfirm,
  buildRetryMoneyMoveConfirm,
  buildTestUsdcConfirm,
  buildTestUsdcOnChainConfirm,
} from './moneyActions.js';

const ME = `0x${'a'.repeat(40)}`;
const ADA = `0x${'b'.repeat(40)}`;
const TOKEN = '6f1c2a3b-0000-4000-8000-000000000000';

function ok<T extends object>(card: T | { error: string }): T {
  assert.ok(!('error' in card), JSON.stringify(card));
  return card as T;
}
const err = (card: object) => (card as { error: string }).error;

test('paying a payment link names who is paid, says it is not a protected deal, and checks the balance first', () => {
  const link = { token: TOKEN, recipient: ADA, recipientLabel: '@ada', amountUsdc: 25, note: 'Logo', status: 'open', walletUsdc: 100 };
  const card = ok(buildPayPaymentLinkConfirm(link));
  assert.deepEqual(card.payload, { token: TOKEN, recipient: ADA, amountUsdc: 25 });
  assert.match(card.summary ?? '', /not a protected deal/);
  assert.ok(card.fields.some((f) => f.label === 'Balance after' && f.value === '75.00 USDC'));
  assert.match(err(buildPayPaymentLinkConfirm({ ...link, walletUsdc: 10 })), /Add 15\.00 USDC first/);
  assert.match(err(buildPayPaymentLinkConfirm({ ...link, status: 'matched' })), /no longer open/);
  assert.match(err(buildPayPaymentLinkConfirm({ ...link, amountUsdc: 0 })), /no fixed amount/);
  assert.match(err(buildPayPaymentLinkConfirm({ ...link, walletUsdc: null })), /Could not read/);
});

test('test USDC is testnet only', () => {
  assert.deepEqual(ok(buildTestUsdcConfirm({ address: ME, target: 'buyer', testnet: true })).payload, { address: ME, target: 'buyer' });
  assert.match(err(buildTestUsdcConfirm({ address: ME, target: 'identity', testnet: false })), /only on testnet/);
  assert.deepEqual(ok(buildTestUsdcOnChainConfirm({ address: ME, chain: 'baseSepolia', chainName: 'Base Sepolia', testnet: true })).payload, { address: ME, chain: 'baseSepolia' });
  assert.ok('error' in buildTestUsdcOnChainConfirm({ address: ME, chain: 'baseSepolia', chainName: 'Base Sepolia', testnet: false }));
});

test('a stuck move is carried on when it never left, otherwise looked for again', () => {
  assert.equal(ok(buildRecheckMoneyMoveConfirm({ bridgeId: 'b', amountUsdc: '10', direction: 'out', status: 'error', notStarted: true })).payload.step, 'resume');
  assert.equal(ok(buildRecheckMoneyMoveConfirm({ bridgeId: 'b', amountUsdc: '10', direction: 'in', status: 'relaying', notStarted: false })).payload.step, 'recheck');
  assert.match(err(buildRecheckMoneyMoveConfirm({ bridgeId: 'b', amountUsdc: '10', direction: 'in', status: 'minted', notStarted: false })), /already arrived/);
});

test('a finished rail move cannot be retried or cancelled', () => {
  assert.deepEqual(ok(buildRetryMoneyMoveConfirm({ intentId: 'i', label: 'bank deposit', status: 'failed' })).payload, { intentId: 'i' });
  assert.deepEqual(ok(buildCancelMoneyMoveConfirm({ intentId: 'i', label: 'bank deposit', status: 'waiting' })).payload, { intentId: 'i' });
  assert.match(err(buildRetryMoneyMoveConfirm({ intentId: 'i', label: 'x', status: 'completed' })), /already completed/);
  assert.match(err(buildCancelMoneyMoveConfirm({ intentId: 'i', label: 'x', status: 'cancelled' })), /already cancelled/);
});

test('payout recheck, pause and address removal carry the page bodies', () => {
  const JOB = `0x${'1'.repeat(64)}`;
  assert.deepEqual(ok(buildRecheckPayoutConfirm({ jobId: JOB, caller: ME, reference: 'KWN-1', amountUsdc: '50' })).payload, { jobId: JOB, caller: ME, reference: 'KWN-1' });
  assert.match(ok(buildPauseMoneyOutConfirm({ paused: false })).warning ?? '', /World ID/);
  assert.match(err(buildPauseMoneyOutConfirm({ paused: true })), /already paused/);
  assert.deepEqual(ok(buildRemovePayoutAddressConfirm({ addressId: 'a-1', address: ADA, chainName: 'Base' })).payload, { addressId: 'a-1' });
});
