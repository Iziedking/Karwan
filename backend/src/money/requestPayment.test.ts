import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics, erc20Abi } from 'viem';
import { coversRequest, payerOf, receivedBy } from './requestPayment.js';

const USDC = '0x3600000000000000000000000000000000000000';
const RECIPIENT = '0x7711886865c33606ebd977da02a6a25373c75c11';
const PAYER = '0x1111111111111111111111111111111111111111';
const ZERO = '0x0000000000000000000000000000000000000000';

function transfer(from: string, to: string, value: bigint, address = USDC) {
  return {
    address: address as `0x${string}`,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: from as `0x${string}`, to: to as `0x${string}` } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
  };
}

test('a direct Arc transfer must cover the whole amount', () => {
  const full = receivedBy([transfer(PAYER, RECIPIENT, 10_000_000n)], USDC, RECIPIENT);
  assert.deepEqual(full, { micros: 10_000_000n, minted: false });
  assert.equal(coversRequest(full, '10'), true);
  assert.equal(coversRequest(receivedBy([transfer(PAYER, RECIPIENT, 9_990_000n)], USDC, RECIPIENT), '10'), false);
});

test('a cross-chain mint may arrive short by the transfer fees, and no more', () => {
  const minted = receivedBy([transfer(ZERO, RECIPIENT, 9_983_000n)], USDC, RECIPIENT);
  assert.equal(minted.minted, true);
  assert.equal(coversRequest(minted, '10'), true);
  assert.equal(coversRequest(receivedBy([transfer(ZERO, RECIPIENT, 9_000_000n)], USDC, RECIPIENT), '10'), false);
});

test('transfers to someone else or of another token do not count', () => {
  assert.equal(receivedBy([transfer(PAYER, PAYER, 10_000_000n)], USDC, RECIPIENT).micros, 0n);
  assert.equal(receivedBy([transfer(PAYER, RECIPIENT, 10_000_000n, '0x2222222222222222222222222222222222222222')], USDC, RECIPIENT).micros, 0n);
  assert.equal(coversRequest({ micros: 0n, minted: false }, null), false);
});

test('an open-amount request takes any payment', () => {
  assert.equal(coversRequest({ micros: 1n, minted: false }, null), true);
});

test('the payer is the sender of the transfer that paid the recipient, never a mint', () => {
  const other = '0x2222222222222222222222222222222222222222';
  assert.equal(payerOf([transfer(PAYER, other, 1n), transfer(PAYER, RECIPIENT, 10_000_000n)], USDC, RECIPIENT), PAYER);
  assert.equal(payerOf([transfer(ZERO, RECIPIENT, 9_983_000n)], USDC, RECIPIENT), null);
  assert.equal(payerOf([transfer(PAYER, RECIPIENT, 1n, other)], USDC, RECIPIENT), null);
});
