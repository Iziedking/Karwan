import assert from 'node:assert/strict';
import test from 'node:test';
import { createDepositRequest, type DepositRequest } from './depositRequests.js';
import { applyIncoming, receivedMicros, remainingUsdc } from './requestReceipts.js';

const NOW = 1_800_000_000_000;
const open = (amountUsdc: string | null = '120'): DepositRequest =>
  createDepositRequest({ owner: '0xabc0000000000000000000000000000000000001', amountUsdc, now: NOW, ttlMinutes: 60 });
const pay = (txId: string, amountUsdc: string, chain = 'Base') => ({ txId, amountUsdc, chain, now: NOW + 1000 });

test('the exact amount pays the request in full', () => {
  const { request, outcome } = applyIncoming(open(), pay('t1', '120'));
  assert.equal(outcome, 'paid');
  assert.equal(request.status, 'matched');
  assert.equal(request.matchedTxId, 't1');
  assert.equal(request.matchedChain, 'Base');
  assert.equal(remainingUsdc(request), '0');
});

test('less than the amount is a part payment and leaves the rest to pay', () => {
  const { request, outcome } = applyIncoming(open(), pay('t1', '100'));
  assert.equal(outcome, 'part');
  assert.equal(request.status, 'open');
  assert.equal(remainingUsdc(request), '20');
  const second = applyIncoming(request, pay('t2', '20', 'Solana'));
  assert.equal(second.outcome, 'paid');
  assert.equal(second.request.status, 'matched');
  assert.equal(second.request.matchedTxId, 't2');
  assert.equal(receivedMicros(second.request), 120_000_000n);
});

test('more than the amount pays in full and the extra is recorded, not refunded', () => {
  const { request, outcome } = applyIncoming(open(), pay('t1', '150.5'));
  assert.equal(outcome, 'paid');
  assert.equal(receivedMicros(request), 150_500_000n);
  assert.equal(remainingUsdc(request), '0');
});

test('the same transfer delivered twice is counted once', () => {
  const first = applyIncoming(open(), pay('t1', '100'));
  const again = applyIncoming(first.request, pay('t1', '100'));
  assert.equal(again.outcome, 'duplicate');
  assert.equal(remainingUsdc(again.request), '20');
});

test('a request with no fixed amount is paid by any payment', () => {
  const { request, outcome } = applyIncoming(open(null), pay('t1', '3'));
  assert.equal(outcome, 'paid');
  assert.equal(request.status, 'matched');
});

test('money that lands after a request closed is still recorded, so it can be delivered', () => {
  const cancelled: DepositRequest = { ...open(), status: 'cancelled' };
  const { request, outcome } = applyIncoming(cancelled, pay('t1', '120'));
  assert.equal(outcome, 'late');
  assert.equal(request.status, 'cancelled');
  assert.equal(receivedMicros(request), 120_000_000n);
  const expired = applyIncoming({ ...open(), expiresAt: NOW }, pay('t2', '120'));
  assert.equal(expired.outcome, 'late');
});
