import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeOnlyTransfers, type RawTransfer } from './nativeTransfers.js';

const TX = `0x${'aa'.repeat(32)}`;
const ESCROW = `0x${'55'.repeat(20)}`;
const AGENT = `0x${'17'.repeat(20)}`;
const FRIEND = `0x${'f1'.repeat(20)}`;
const ME = `0x${'03'.repeat(20)}`;
const ENTRYPOINT_V07 = '0x0000000071727de22e5e9d8baf0edac6f37da032';
const ENTRYPOINT_V06 = '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789';
const E12 = 10n ** 12n;

const t = (from: string, to: string, value: bigint, logIndex: number, txHash = TX): RawTransfer => ({ from, to, value, txHash, logIndex });

test('an ERC-20 transfer, already read from the token contract, is not read again from the system log', () => {
  const erc20 = [t(ESCROW, AGENT, 9_950_000n, 11)];
  const system = [t(ESCROW, AGENT, 9_950_000n * E12, 10)];
  assert.deepEqual(nativeOnlyTransfers(erc20, system), []);
});

test('a plain native send is read, in micro USDC, under its own log', () => {
  const sent = nativeOnlyTransfers([], [t(FRIEND, ME, 25_000_000n * E12 + 7n, 4)]);
  assert.deepEqual(sent, [t(FRIEND, ME, 25_000_000n, 4)]);
});

test('ERC-4337 gas payments and refunds are never money arriving', () => {
  assert.deepEqual(nativeOnlyTransfers([], [t(ENTRYPOINT_V07, ME, 417_456n * E12, 21), t(ENTRYPOINT_V06.toUpperCase().replace('0X', '0x'), ME, 283_201n * E12, 12)]), []);
});

test('dust below one micro USDC is left out', () => {
  assert.deepEqual(nativeOnlyTransfers([], [t(FRIEND, ME, E12 - 1n, 1)]), []);
});

test('two equal sends in one transaction pair one to one', () => {
  const erc20 = [t(FRIEND, ME, 1_000_000n, 3)];
  const system = [t(FRIEND, ME, 1_000_000n * E12, 2), t(FRIEND, ME, 1_000_000n * E12, 5)];
  assert.deepEqual(nativeOnlyTransfers(erc20, system), [t(FRIEND, ME, 1_000_000n, 5)]);
});
