import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chipAmount,
  afterRecheck,
  driverFor,
  fromArcFund,
  fromFundingError,
  fromFundingResponse,
  isAmbiguousFailure,
  fromArcSend,
  fromCircleFund,
  fromMovementError,
  fromMovementResponse,
  groupAddress,
  parseAmount,
  sheetBlocker,
  sheetBusy,
  sheetProgress,
  shortfall,
  spendable,
} from './moneySheetModel';
import { fromMicros, toMicros } from './usdc';

test('amounts are compared in whole micros', () => {
  assert.equal(toMicros(0.29), 290_000);
  assert.equal(toMicros(1240.505123), 1_240_505_123);
  assert.equal(fromMicros(1_500_000), 1.5);
});

test('an amount is parsed the way people type it', () => {
  assert.equal(parseAmount('120'), 120);
  assert.equal(parseAmount(' 7 '), 7);
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount('0.000001'), 0.000001);
  assert.equal(parseAmount('١٢٠'), 120);
  assert.equal(parseAmount('١٢٫٥'), 12.5);
});

test('anything that is not one clear amount is refused', () => {
  for (const input of ['', '0', '0.0', '-5', '1.2345678', '1,240.50', '1.2.3', '.5', 'abc', '5 USDC']) {
    assert.equal(parseAmount(input), null, input);
  }
});

test('a wallet that signs for itself keeps a cent for the network fee', () => {
  assert.equal(spendable(100, 'topUp', true), 99.99);
  assert.equal(spendable(100, 'send', true), 99.99);
  assert.equal(spendable(0.005, 'send', true), 0);
  assert.equal(spendable(100, 'topUp', false), 100);
  assert.equal(spendable(100, 'withdraw', true), 100);
});

test('chips never ask for more than is there', () => {
  assert.equal(chipAmount(1240.5, 'quarter'), 310.12);
  assert.equal(chipAmount(1240.5, 'half'), 620.25);
  assert.equal(chipAmount(1240.505123, 'max'), 1240.505123);
  assert.equal(chipAmount(0.03, 'quarter'), 0);
});

test('the button says what is missing, in the order a person fixes it', () => {
  const base = { move: 'topUp' as const, amount: 50, available: 100, recipient: 'ok' as const };
  assert.equal(sheetBlocker({ ...base, amount: null }), 'noAmount');
  assert.equal(sheetBlocker({ ...base, move: 'send', recipient: 'missing' }), 'recipient');
  assert.equal(sheetBlocker({ ...base, move: 'send', recipient: 'checking' }), 'recipient');
  assert.equal(sheetBlocker({ ...base, available: null }), 'loading');
  assert.equal(sheetBlocker({ ...base, amount: 100.000001 }), 'short');
  assert.equal(sheetBlocker({ ...base, amount: 100 }), null);
  assert.equal(sheetBlocker({ ...base, move: 'send', recipient: 'invalid', amount: null }), 'noAmount');
});

test('the shortfall is exact', () => {
  assert.equal(shortfall(2000, 1240.5), 759.5);
  assert.equal(shortfall(10, 20), 0);
});

test('an address is shown in groups of four to check against', () => {
  assert.equal(
    groupAddress('0x1234567890abcdef1234567890ABCDEF12345678'),
    '0x 1234 5678 90ab cdef 1234 5678 90AB CDEF 1234 5678',
  );
});

test('the progress line and busy flag follow the state', () => {
  assert.deepEqual(sheetProgress({ kind: 'signing' }), { done: 0, current: 'signed' });
  assert.deepEqual(sheetProgress({ kind: 'sent' }), { done: 1, current: 'sent' });
  assert.deepEqual(sheetProgress({ kind: 'slow', reference: null, txHash: null }), { done: 2, current: 'confirmed' });
  assert.deepEqual(sheetProgress({ kind: 'confirmed', reference: null, txHash: null }), { done: 3, current: null });
  assert.equal(sheetProgress({ kind: 'editing' }), null);
  assert.equal(sheetBusy({ kind: 'signing' }), true);
  assert.equal(sheetBusy({ kind: 'sent' }), true);
  assert.equal(sheetBusy({ kind: 'slow', reference: null, txHash: '0x1' }), false);
});

const ids = { reference: 'KRW-1', txHash: '0xabc' as const };

test('a wallet top-up is never shown as failed once it has a hash, unless the chain reverted it', () => {
  assert.deepEqual(fromArcFund(null), { kind: 'signing' });
  assert.deepEqual(fromArcFund({ phase: 'switching' }), { kind: 'signing' });
  assert.deepEqual(fromArcFund({ phase: 'confirming', ...ids }), { kind: 'sent' });
  assert.deepEqual(fromArcFund({ phase: 'unconfirmed', ...ids }), { kind: 'slow', ...ids });
  assert.deepEqual(fromArcFund({ phase: 'settling', ...ids }), { kind: 'confirmed', ...ids });
  assert.deepEqual(fromArcFund({ phase: 'done', ...ids }), { kind: 'confirmed', ...ids });
  assert.deepEqual(fromArcFund({ phase: 'error', ...ids, error: 'Network error. Try again.' }), { kind: 'slow', ...ids });
  assert.deepEqual(fromArcFund({ phase: 'error', ...ids, error: 'Transaction reverted on chain' }), { kind: 'reverted' });
  assert.deepEqual(fromArcFund({ phase: 'error', error: 'Cancelled in wallet' }), { kind: 'failed', declined: true });
  assert.deepEqual(fromArcFund({ phase: 'error', error: 'Not enough USDC on Arc' }), { kind: 'failed', declined: false });
});

test('an email top-up waits when the backend cannot say, and fails only when nothing moved', () => {
  assert.deepEqual(fromCircleFund(null), { kind: 'sent' });
  assert.deepEqual(fromCircleFund({ phase: 'sending' }), { kind: 'sent' });
  assert.deepEqual(fromCircleFund({ phase: 'settling', ...ids }), { kind: 'slow', ...ids });
  assert.deepEqual(fromCircleFund({ phase: 'done', ...ids }), { kind: 'confirmed', ...ids });
  assert.deepEqual(fromCircleFund({ phase: 'error' }), { kind: 'failed', declined: false });
});

test('a same-chain send maps its record honestly', () => {
  assert.deepEqual(fromArcSend(null, 'wallet'), { kind: 'signing' });
  assert.deepEqual(fromArcSend(null, 'account'), { kind: 'sent' });
  assert.deepEqual(fromArcSend({ phase: 'burning' }, 'wallet'), { kind: 'signing' });
  assert.deepEqual(fromArcSend({ phase: 'burning' }, 'account'), { kind: 'sent' });
  assert.deepEqual(fromArcSend({ phase: 'relaying', burnTxHash: '0x1', mintTxHash: '0x1' }, 'wallet'), { kind: 'slow', reference: null, txHash: '0x1' });
  assert.deepEqual(fromArcSend({ phase: 'done', mintTxHash: '0x2' }, 'account'), { kind: 'confirmed', reference: null, txHash: '0x2' });
  assert.deepEqual(fromArcSend({ phase: 'error', burnTxHash: '0x3', error: 'The network rejected this send. Nothing was charged.' }, 'wallet'), { kind: 'reverted' });
  assert.deepEqual(fromArcSend({ phase: 'error', error: 'You declined the transaction in your wallet.' }, 'wallet'), { kind: 'failed', declined: true });
});

test('a one-call move is confirmed only when its movement completed', () => {
  assert.deepEqual(fromMovementResponse({ movementState: 'completed', ...ids }), { kind: 'confirmed', ...ids });
  assert.deepEqual(fromMovementResponse({ movementState: 'verifying', reference: 'KRW-2' }), { kind: 'slow', reference: 'KRW-2', txHash: null });
});

test('a failed call that may have moved money waits instead of failing', () => {
  assert.deepEqual(fromMovementError(502, 'withdrawal needs attention', { reference: 'KRW-3' }), { kind: 'slow', reference: 'KRW-3', txHash: null });
  assert.deepEqual(fromMovementError(409, 'a withdrawal is already in progress for this agent', {}), { kind: 'slow', reference: null, txHash: null });
  assert.deepEqual(fromMovementError(409, 'no agent wallets for this address', {}), { kind: 'failed', declined: false });
  assert.deepEqual(fromMovementError(502, 'withdrawal failed', { error: 'withdrawal failed' }), { kind: 'failed', declined: false });
});

test('a thousands group is refused, not read as a decimal point', () => {
  for (const input of ['1,000', '1,500', '1.000', '12,345']) assert.equal(parseAmount(input), null, input);
  assert.equal(parseAmount('1,5'), 1.5);
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('0.125'), 0.125);
});

test('a funding answer that cannot say what happened waits; only a clear refusal fails', () => {
  assert.deepEqual(fromFundingResponse({ txHash: '0x1', reference: 'KRW-1' }), { kind: 'confirmed', reference: 'KRW-1', txHash: '0x1' });
  assert.deepEqual(fromFundingResponse({ code: 'funding_unconfirmed', txHash: '0x1', reference: 'KRW-1' }), { kind: 'slow', reference: 'KRW-1', txHash: '0x1' });
  assert.deepEqual(fromFundingError(502, 'funding_failed'), { kind: 'failed', declined: false });
  assert.deepEqual(fromFundingError(400, undefined), { kind: 'failed', declined: false });
  assert.deepEqual(fromFundingError(504, undefined), { kind: 'slow', reference: null, txHash: null });
  assert.deepEqual(fromFundingError(409, 'funding_in_flight'), { kind: 'slow', reference: null, txHash: null });
  assert.deepEqual(fromFundingError(null, undefined), { kind: 'slow', reference: null, txHash: null });
});

test('an ambiguous failure is one where money may have moved', () => {
  assert.equal(isAmbiguousFailure(null), true);
  assert.equal(isAmbiguousFailure(502), true);
  assert.equal(isAmbiguousFailure(504), true);
  assert.equal(isAmbiguousFailure(400), false);
  assert.equal(isAmbiguousFailure(422), false);
});

test('a re-check never turns a wait into a failure', () => {
  const waiting = { kind: 'slow' as const, reference: 'KRW-9', txHash: null };
  assert.deepEqual(afterRecheck(waiting, { kind: 'failed', declined: false }), waiting);
  assert.deepEqual(afterRecheck(waiting, { kind: 'confirmed', reference: 'KRW-9', txHash: '0x1' }), { kind: 'confirmed', reference: 'KRW-9', txHash: '0x1' });
  assert.deepEqual(afterRecheck({ kind: 'sent' }, { kind: 'failed', declined: false }), { kind: 'failed', declined: false });
});

test('each request has exactly one driver, and an incomplete one has none', () => {
  assert.equal(driverFor({ move: 'topUp', agent: 'buyer', amount: 5, agentAddress: '0x1', source: 'balance' }, true), 'walletTopUp');
  assert.equal(driverFor({ move: 'topUp', agent: 'buyer', amount: 5, agentAddress: '0x1', source: 'balance' }, false), 'accountTopUp');
  assert.equal(driverFor({ move: 'topUp', agent: 'buyer', amount: 5, agentAddress: '0x1', source: 'pool' }, true), 'poolTopUp');
  assert.equal(driverFor({ move: 'topUp', agent: 'buyer', amount: 5 }, true), null);
  assert.equal(driverFor({ move: 'send', agent: 'buyer', amount: 5 }, false), null);
  assert.equal(driverFor({ move: 'send', agent: 'buyer', amount: 5, recipient: '0x2' }, false), 'send');
  assert.equal(driverFor({ move: 'withdraw', agent: 'seller', amount: 5 }, true), 'withdraw');
});
