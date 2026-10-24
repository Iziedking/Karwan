import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proveVaultStake,
  proveVaultStakeApproval,
  parseVaultStakeHint,
  receiptParties,
  vaultStakeIntentOperationKey,
} from './vaultStake.js';
import { encodeAbiParameters, encodeEventTopics } from 'viem';

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

test('browser vault intent keys are stable and request-scoped', () => {
  assert.equal(vaultStakeIntentOperationKey(OWNER, 'req-1'), `vault:stake:web3-intent:${OWNER}:req-1`);
  assert.notEqual(vaultStakeIntentOperationKey(OWNER, 'req-1'), vaultStakeIntentOperationKey(OWNER, 'req-2'));
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

test('proves an exact Circle approval for the vault and amount', () => {
  assert.doesNotThrow(() =>
    proveVaultStakeApproval({
      receiptTo: USDC,
      receiptFrom: OWNER,
      usdcAddress: USDC,
      ownerAddress: OWNER,
      vaultAddress: VAULT,
      expectedAmountMicros: 20_000_000n,
      approvals: [
        {
          tokenAddress: USDC,
          owner: OWNER,
          spender: VAULT,
          value: 20_000_000n,
        },
      ],
    }),
  );
});

test('rejects a Circle approval for a different spender or amount', () => {
  assert.throws(
    () =>
      proveVaultStakeApproval({
        receiptTo: USDC,
        receiptFrom: OWNER,
        usdcAddress: USDC,
        ownerAddress: OWNER,
        vaultAddress: VAULT,
        expectedAmountMicros: 20_000_000n,
        approvals: [
          {
            tokenAddress: USDC,
            owner: OWNER,
            spender: '0x0000000000000000000000000000000000000004',
            value: 20_000_000n,
          },
        ],
      }),
    /unique allowance/,
  );
});

// An email account's stake, shaped as on Arc Testnet on 24 Oct 2026 (approval
// tx 0x842e2aea…2221): the receipt goes to the EntryPoint from the bundler,
// and the user operation event names the wallet as sender.
const ENTRY_POINT = '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789';
const BUNDLER = '0xf18c33c9a6f4b1ac83490a145ad52ed63c77f3f3';
const userOpLog = (sender: string, success: boolean) => ({
  address: ENTRY_POINT,
  topics: encodeEventTopics({ abi: userOpAbi, eventName: 'UserOperationEvent', args: { userOpHash: `0x${'31'.repeat(32)}`, sender, paymaster: '0x0000000000000000000000000000000000000000' } }) as string[],
  data: encodeAbiParameters([{ type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }], [120n, success, 1n, 1n]),
});
const userOpAbi = [{
  type: 'event', name: 'UserOperationEvent', inputs: [
    { name: 'userOpHash', type: 'bytes32', indexed: true }, { name: 'sender', type: 'address', indexed: true }, { name: 'paymaster', type: 'address', indexed: true },
    { name: 'nonce', type: 'uint256', indexed: false }, { name: 'success', type: 'bool', indexed: false }, { name: 'actualGasCost', type: 'uint256', indexed: false }, { name: 'actualGasUsed', type: 'uint256', indexed: false },
  ],
}] as const;

test('a smart account stake is proved by its user operation and the token and vault events', () => {
  const parties = receiptParties({ to: ENTRY_POINT, from: BUNDLER, logs: [userOpLog(OWNER, true)] }, OWNER);
  assert.deepEqual(parties, { receiptTo: null, receiptFrom: OWNER, smartAccount: true });
  assert.doesNotThrow(() =>
    proveVaultStakeApproval({ ...parties, usdcAddress: USDC, ownerAddress: OWNER, vaultAddress: VAULT, expectedAmountMicros: 50_000_000n, approvals: [{ tokenAddress: USDC, owner: OWNER, spender: VAULT, value: 50_000_000n }] }),
  );
  const proof = proveVaultStake({
    ...parties, vaultAddress: VAULT, ownerAddress: OWNER, usdcAddress: USDC, expectedAmountMicros: 50_000_000n,
    transfers: [{ tokenAddress: USDC, from: OWNER, to: VAULT, value: 50_000_000n }],
    deposits: [{ positionId: 9n, owner: OWNER, principal: 50_000_000n, emitter: VAULT }],
  });
  assert.deepEqual(proof, { amountMicros: 50_000_000n, positionId: 9n });
});

test('a user operation that failed, or ran for someone else, proves nothing', () => {
  const failed = receiptParties({ to: ENTRY_POINT, from: BUNDLER, logs: [userOpLog(OWNER, false)] }, OWNER);
  assert.equal(failed.receiptFrom, BUNDLER);
  assert.throws(() => proveVaultStakeApproval({ ...failed, usdcAddress: USDC, ownerAddress: OWNER, vaultAddress: VAULT, expectedAmountMicros: 1n, approvals: [{ tokenAddress: USDC, owner: OWNER, spender: VAULT, value: 1n }] }), /sender does not match/);
  const other = receiptParties({ to: ENTRY_POINT, from: BUNDLER, logs: [userOpLog(VAULT, true)] }, OWNER);
  assert.equal(other.receiptFrom, BUNDLER);
});

test('from a smart account, a Deposited event from any contract but the vault does not count', () => {
  const parties = receiptParties({ to: ENTRY_POINT, from: BUNDLER, logs: [userOpLog(OWNER, true)] }, OWNER);
  assert.throws(() => proveVaultStake({
    ...parties, vaultAddress: VAULT, ownerAddress: OWNER, usdcAddress: USDC, expectedAmountMicros: 50_000_000n,
    transfers: [{ tokenAddress: USDC, from: OWNER, to: VAULT, value: 50_000_000n }],
    deposits: [{ positionId: 9n, owner: OWNER, principal: 50_000_000n, emitter: USDC }],
  }), /no unique vault deposit event/);
});

test('a plain wallet transaction keeps the receipt checks', () => {
  assert.deepEqual(receiptParties({ to: VAULT, from: OWNER, logs: [] }, OWNER), { receiptTo: VAULT, receiptFrom: OWNER, smartAccount: false });
});
