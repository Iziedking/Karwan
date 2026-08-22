import assert from 'node:assert/strict';
import test from 'node:test';
import { chainErrorMessage } from './chainError';
import { ConfirmationPending } from '@/shared/chain/confirmTx';
import { en } from '@/shared/i18n/messages/en';

const copy = en.chainErrors;
const FALLBACK = 'fallback';
const HASH = '0x322c6e8d8660e91652015f7509fc12a3591bbfd16a7506ff7fd105769c616e09' as const;

function named(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

test('a confirmation that has not arrived never says nothing moved', () => {
  // The bug: viem's timeout contains "timed out", which matched the network
  // branch and returned "Connection hiccup. Nothing moved." A wait that ran out
  // says the watcher stopped watching. On a slow block the money already moved,
  // and this sentence was the one users read.
  const timeout = named(
    'WaitForTransactionReceiptTimeoutError',
    `Timed out while waiting for transaction with hash "${HASH}" to be confirmed.`,
  );
  assert.equal(chainErrorMessage(timeout, copy, FALLBACK), copy.pending);
  assert.notEqual(chainErrorMessage(timeout, copy, FALLBACK), copy.network);
});

test('the pending signal from confirmTransaction is recognised too', () => {
  assert.equal(chainErrorMessage(new ConfirmationPending(HASH), copy, FALLBACK), copy.pending);
});

test('a receipt that cannot be found yet is pending, not a failure', () => {
  const missing = named(
    'TransactionReceiptNotFoundError',
    `Transaction receipt with hash "${HASH}" could not be found.`,
  );
  assert.equal(chainErrorMessage(missing, copy, FALLBACK), copy.pending);
});

test('a real network failure still reads as a network failure', () => {
  // The branch the fix sits in front of has to keep working: a fetch that never
  // reached the chain genuinely did move nothing.
  assert.equal(chainErrorMessage(new Error('fetch failed'), copy, FALLBACK), copy.network);
  assert.equal(chainErrorMessage(new Error('ECONNRESET'), copy, FALLBACK), copy.network);
});

test('the other mappings are untouched', () => {
  const cases: Array<[string, string]> = [
    ['User rejected the request', copy.declined],
    ['Insufficient total maxFee across intents', copy.feeHeadroom],
    ['insufficient funds for gas * price + value', copy.needsGas],
    ['transfer amount exceeds balance', copy.notEnough],
    ['replacement transaction underpriced', copy.walletBusy],
    ['chain mismatch', copy.wrongChain],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(chainErrorMessage(new Error(raw), copy, FALLBACK), expected, raw);
  }
});

test('an unrecognised failure never leaks its own message', () => {
  const leaky = new Error('Gateway API error: HTTP 400 - 0x3600... reverted at pc=142');
  assert.equal(chainErrorMessage(leaky, copy, FALLBACK), FALLBACK);
  assert.equal(chainErrorMessage(undefined, copy, FALLBACK), FALLBACK);
});
