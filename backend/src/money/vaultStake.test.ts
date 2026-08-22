import test from 'node:test';
import assert from 'node:assert/strict';
import { proveVaultStake, parseVaultStakeHint } from './vaultStake.js';

const OWNER = '0x0000000000000000000000000000000000000001';
const VAULT = '0x0000000000000000000000000000000000000002';
const USDC = '0x0000000000000000000000000000000000000003';

function validProof() {
  return proveVaultStake({
    receiptTo: VAULT,
    receiptFrom: OWNER,
    vaultAddress: VAULT,
    ownerAddress: OWNER,
    usdcAddress: USDC,
    expectedAmountMicros: 20_000_000n,
    transfers: [{ tokenAddress: USDC, from: OWNER, to: VAULT, value: 20_000_000n }],
    deposits: [{ positionId: 7n, owner: OWNER, principal: 20_000_000n }],
  });
}

test('proves an exact vault stake from both token and vault events', () => {
  assert.deepEqual(validProof(), { amountMicros: 20_000_000n, positionId: 7n });
});

test('rejects a client amount that differs from the transfer', () => {
  assert.throws(
    () => proveVaultStake({
      receiptTo: VAULT,
      receiptFrom: OWNER,
      vaultAddress: VAULT,
      ownerAddress: OWNER,
      usdcAddress: USDC,
      expectedAmountMicros: 21_000_000n,
      transfers: [{ tokenAddress: USDC, from: OWNER, to: VAULT, value: 20_000_000n }],
      deposits: [{ positionId: 7n, owner: OWNER, principal: 20_000_000n }],
    }),
    /does not match/,
  );
});

test('rejects a successful vault call without a matching deposit event', () => {
  assert.throws(
    () => proveVaultStake({
      receiptTo: VAULT,
      receiptFrom: OWNER,
      vaultAddress: VAULT,
      ownerAddress: OWNER,
      usdcAddress: USDC,
      transfers: [{ tokenAddress: USDC, from: OWNER, to: VAULT, value: 20_000_000n }],
      deposits: [],
    }),
    /deposit event/,
  );
});

test('parses the client amount only as a precise comparison hint', () => {
  assert.equal(parseVaultStakeHint('20.000001'), 20_000_001n);
});
