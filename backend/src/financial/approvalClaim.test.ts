import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { claimFinancialApproval } from './approvalClaim.js';

const destination = '0x2222222222222222222222222222222222222222';

function command(overrides: Record<string, unknown> = {}) {
  return {
    commandId: 'financial-approval-command',
    idempotencyKey: 'financial:approval:claim',
    operation: 'ESCROW_FUNDING' as const,
    amountUsdc: '12.500000',
    sourceAddress: '0x1111111111111111111111111111111111111111',
    destinationAddress: destination,
    expectedDealRoomVersion: 1,
    mandateVersion: 1,
    nowUnix: 1_000,
    approvalId: 'approval-claim',
    approvalVersion: 2,
    ...overrides,
  };
}

async function approvedRepository(data: Record<string, unknown> = {}) {
  const repository = new InMemoryAgentRuntimeRepository();
  const requested = await repository.createApproval({
    id: 'approval-claim',
    dealRoomId: 'room-approval-claim',
    requestKey: 'financial:approval:claim',
    kind: 'escrow-funding',
    expiresAt: 2_000,
    data: { amountUsdc: '12.500000', operation: 'ESCROW_FUNDING', destinationAddress: destination, ...data },
    now: 900,
  });
  await repository.updateApproval(requested.id, requested.version, 'approved', undefined, 950);
  return repository;
}

test('claim transitions one exact approved command to executed', async () => {
  const repository = await approvedRepository();
  const result = await claimFinancialApproval(repository, { command: command(), executionNow: 1_001 });
  assert.equal(result.state, 'executed');
  assert.equal(result.version, 3);
  assert.equal(result.data.financialIdempotencyKey, 'financial:approval:claim');
});

test('claim compares USDC amounts by exact micro-units, not formatting', async () => {
  const repository = await approvedRepository({ amountUsdc: '12.5' });
  const result = await claimFinancialApproval(repository, { command: command(), executionNow: 1_001 });
  assert.equal(result.state, 'executed');
});

test('claim rejects a different actor when approval identity is supplied', async () => {
  const repository = await approvedRepository({
    approverAddress: '0x1111111111111111111111111111111111111111',
  });
  await assert.rejects(
    () => claimFinancialApproval(repository, {
      command: command(),
      executionNow: 1_001,
      actorAddress: '0x3333333333333333333333333333333333333333',
    }),
    /APPROVAL_ACTOR_MISMATCH/,
  );
  assert.equal((await repository.getApproval('approval-claim'))?.state, 'approved');

  const matchingRepository = await approvedRepository({
    approverAddress: '0x1111111111111111111111111111111111111111',
  });
  const matching = await claimFinancialApproval(matchingRepository, {
    command: command(),
    executionNow: 1_001,
    actorAddress: '0x1111111111111111111111111111111111111111',
  });
  assert.equal(matching.state, 'executed');

  const legacyRepository = await approvedRepository();
  const legacy = await claimFinancialApproval(legacyRepository, {
    command: command(),
    executionNow: 1_001,
  });
  assert.equal(legacy.state, 'executed');
});

test('claim rejects mismatched amount, operation, and destination before transition', async () => {
  for (const overrides of [
    { amountUsdc: '12.51' },
    { operation: 'STAKE' as const },
    { destinationAddress: '0x3333333333333333333333333333333333333333' },
  ]) {
    const repository = await approvedRepository();
    await assert.rejects(
      () => claimFinancialApproval(repository, { command: command(overrides), executionNow: 1_001 }),
      /APPROVAL_(AMOUNT|OPERATION|DESTINATION)_MISMATCH/,
    );
    assert.equal((await repository.getApproval('approval-claim'))?.state, 'approved');
  }
});

test('two concurrent claims have one winner and one optimistic-concurrency loser', async () => {
  const repository = await approvedRepository();
  const results = await Promise.allSettled([
    claimFinancialApproval(repository, { command: command(), executionNow: 1_001 }),
    claimFinancialApproval(repository, { command: command({ commandId: 'financial-approval-command-replay' }), executionNow: 1_002 }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await repository.getApproval('approval-claim'))?.state, 'executed');
});
