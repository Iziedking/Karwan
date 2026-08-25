import assert from 'node:assert/strict';
import test from 'node:test';
import { createCircleWalletAdapter } from './CircleWalletAdapter.js';

test('Circle adapter preserves explicit idempotency, maps balances, and normalizes status', async () => {
  const calls: Array<{ kind: string; input: unknown }> = [];
  const client = {
    getWalletTokenBalance: async (input: unknown) => {
      calls.push({ kind: 'balance', input });
      return { data: { tokenBalances: [{ tokenId: 'usdc', amount: '12.5' }, { tokenId: 'other', amount: '4' }] } };
    },
    getTransaction: async (input: unknown) => {
      calls.push({ kind: 'get-transaction', input });
      return { data: { transaction: { id: 'circle-tx-1', state: 'complete', txHash: '0xabc' } } };
    },
    createTransaction: async (input: unknown) => {
      calls.push({ kind: 'transfer', input });
      return { data: { id: 'circle-transfer-1', state: 'QUEUED' } };
    },
    createContractExecutionTransaction: async (input: unknown) => {
      calls.push({ kind: 'contract', input });
      return { data: { id: 'circle-contract-1', state: 'INITIATED' } };
    },
  };
  const adapter = createCircleWalletAdapter({
    client: client as never,
    clock: () => 1_000,
    policyReader: async (input) => ({ walletId: input.walletId, operation: input.operation, allowed: true, version: 'policy-1' }),
  });

  assert.deepEqual(await adapter.getBalance({ walletId: 'wallet-1', tokenId: 'usdc' }), {
    walletId: 'wallet-1',
    observedAt: 1_000,
    balances: [{ tokenId: 'usdc', amount: '12.5' }],
  });
  assert.deepEqual(await adapter.getPolicy({ walletId: 'wallet-1', operation: 'stake' }), {
    walletId: 'wallet-1', operation: 'stake', allowed: true, version: 'policy-1',
  });
  assert.deepEqual(await adapter.createTransfer({
    idempotencyKey: 'money:room-1:stake:1',
    walletId: 'wallet-1',
    tokenId: 'usdc',
    destinationAddress: '0x1111111111111111111111111111111111111111',
    amountUsdc: '25',
    feeLevel: 'LOW',
  }), { providerId: 'circle-transfer-1', status: 'QUEUED' });
  assert.deepEqual(await adapter.executeContract({
    idempotencyKey: 'money:room-1:approve:1',
    walletId: 'wallet-1',
    contractAddress: '0x2222222222222222222222222222222222222222',
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: ['0x3333333333333333333333333333333333333333', '25'],
    feeLevel: 'MEDIUM',
  }), { providerId: 'circle-contract-1', status: 'INITIATED' });
  assert.deepEqual(await adapter.getTransaction('circle-tx-1'), {
    providerId: 'circle-tx-1', status: 'COMPLETE', txHash: '0xabc',
    raw: { id: 'circle-tx-1', state: 'complete', txHash: '0xabc' },
  });
  assert.equal(await adapter.getTransactionStatus('circle-tx-1'), 'COMPLETE');

  const transfer = calls.find((call) => call.kind === 'transfer')!.input as Record<string, unknown>;
  assert.equal(transfer.idempotencyKey, 'money:room-1:stake:1');
  assert.deepEqual(transfer.fee, { type: 'level', config: { feeLevel: 'LOW' } });
  const contract = calls.find((call) => call.kind === 'contract')!.input as Record<string, unknown>;
  assert.equal(contract.idempotencyKey, 'money:room-1:approve:1');
  assert.deepEqual(contract.abiParameters, ['0x3333333333333333333333333333333333333333', '25']);
});

test('Circle adapter fails closed on incomplete provider responses and contract calldata', async () => {
  const client = {
    getWalletTokenBalance: async () => ({ data: { tokenBalances: [] } }),
    getTransaction: async () => ({ data: { transaction: { state: 'UNKNOWN' } } }),
    createTransaction: async () => ({ data: {} }),
    createContractExecutionTransaction: async () => ({ data: {} }),
  };
  const adapter = createCircleWalletAdapter({ client: client as never });
  await assert.rejects(() => adapter.getTransaction(''), /providerId is required/);
  await assert.rejects(() => adapter.createTransfer({
    idempotencyKey: '', walletId: 'wallet-1', tokenId: 'usdc',
    destinationAddress: '0x1', amountUsdc: '1', feeLevel: 'LOW',
  }), /idempotencyKey is required/);
  await assert.rejects(() => adapter.executeContract({
    idempotencyKey: 'command-1', walletId: 'wallet-1', contractAddress: '0x1', feeLevel: 'LOW',
  }), /abiFunctionSignature or callData is required/);
  await assert.rejects(() => adapter.createTransfer({
    idempotencyKey: 'command-2', walletId: 'wallet-1', tokenId: 'usdc',
    destinationAddress: '0x1', amountUsdc: '1', feeLevel: 'LOW',
  }), /provider transaction id/);
});
