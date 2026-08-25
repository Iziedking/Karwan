import assert from 'node:assert/strict';
import test from 'node:test';
import type { CircleWalletAdapter } from '../circle/CircleWalletAdapter.js';
import { createFinancialReconciliationWorker, type ReconciliationWorkerScheduler } from './reconciliationWorker.js';
import { InMemoryFinancialRuntimeRepository } from './runtime.js';

function command(idempotencyKey: string) {
  return {
    commandId: `command:${idempotencyKey}`,
    idempotencyKey,
    operation: 'ESCROW_FUNDING' as const,
    amountUsdc: '5',
    amountMicros: '5000000',
    sourceAddress: '0x1111111111111111111111111111111111111111',
    destinationAddress: '0x2222222222222222222222222222222222222222',
    expectedDealRoomVersion: 1,
    mandateVersion: 1,
    decision: 'AUTHORIZED' as const,
    reason: 'POLICY_ACCEPTED',
    data: {},
    now: 100,
  };
}

function scheduler(): {
  scheduler: ReconciliationWorkerScheduler;
  jobs: Array<{ handler: () => void; delayMs: number }>;
} {
  const jobs: Array<{ handler: () => void; delayMs: number }> = [];
  return {
    jobs,
    scheduler: {
      setTimeout: (handler, delayMs) => {
        const job = { handler, delayMs };
        jobs.push(job);
        return job;
      },
      clearTimeout: (handle) => {
        const index = jobs.indexOf(handle as { handler: () => void; delayMs: number });
        if (index >= 0) jobs.splice(index, 1);
      },
    },
  };
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test('runOnce reconciles persisted commands through getTransaction only', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const created = await repository.recordDecision(command('financial:worker:1'));
  await repository.recordProviderUpdate(
    created.record.idempotencyKey,
    created.record.version,
    { lifecycle: 'UNKNOWN', providerId: 'circle-worker-1' },
    110,
  );
  let polls = 0;
  let createCalls = 0;
  const adapter: Pick<CircleWalletAdapter, 'getTransaction'> = {
    async getTransaction(providerId) {
      polls += 1;
      return { providerId, status: 'COMPLETE' as const, txHash: '0xworker-settled', raw: {} };
    },
  };
  const worker = createFinancialReconciliationWorker(repository, adapter, {
    now: () => 120,
    onResult: () => { createCalls += 1; },
  });

  const result = await worker.runOnce();
  assert.deepEqual(result, { scanned: 1, polled: 1, updated: 1, skipped: 0, errors: [] });
  assert.equal(polls, 1);
  assert.equal(createCalls, 0);
  assert.equal((await repository.get('financial:worker:1'))?.providerLifecycle, 'SETTLED');
});

test('concurrent runOnce calls share one pass and one provider poll', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const created = await repository.recordDecision(command('financial:worker:dedupe'));
  await repository.recordProviderUpdate(
    created.record.idempotencyKey,
    created.record.version,
    { lifecycle: 'UNKNOWN', providerId: 'circle-worker-dedupe' },
    110,
  );
  let polls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const worker = createFinancialReconciliationWorker(repository, {
    async getTransaction(providerId) {
      polls += 1;
      await gate;
      return { providerId, status: 'COMPLETE' as const, txHash: '0xdedupe', raw: {} };
    },
  });

  const first = worker.runOnce();
  const second = worker.runOnce();
  assert.equal(first, second);
  release();
  await first;
  assert.equal(polls, 1);
});

test('scheduled passes do not overlap and stop cancels the next pass', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const created = await repository.recordDecision(command('financial:worker:loop'));
  await repository.recordProviderUpdate(
    created.record.idempotencyKey,
    created.record.version,
    { lifecycle: 'UNKNOWN', providerId: 'circle-worker-loop' },
    110,
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let polls = 0;
  const manual = scheduler();
  const results: number[] = [];
  const worker = createFinancialReconciliationWorker(repository, {
    async getTransaction(providerId) {
      polls += 1;
      await gate;
      return { providerId, status: 'COMPLETE' as const, txHash: '0xloop', raw: {} };
    },
  }, {
    intervalMs: 500,
    scheduler: manual.scheduler,
    onResult: (result) => results.push(result.updated),
  });

  worker.start();
  assert.deepEqual(manual.jobs.map((job) => job.delayMs), [0]);
  const first = manual.jobs.shift();
  assert.ok(first);
  first.handler();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(polls, 1);
  assert.equal(manual.jobs.length, 0);

  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(results, [1]);
  assert.deepEqual(manual.jobs.map((job) => job.delayMs), [500]);

  worker.stop();
  assert.equal(manual.jobs.length, 0);
  assert.equal(polls, 1);
});

test('provider errors are reported and the loop remains retryable without resubmission', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const created = await repository.recordDecision(command('financial:worker:error'));
  await repository.recordProviderUpdate(
    created.record.idempotencyKey,
    created.record.version,
    { lifecycle: 'UNKNOWN', providerId: 'circle-worker-error' },
    110,
  );
  const manual = scheduler();
  const errors: string[] = [];
  let polls = 0;
  const worker = createFinancialReconciliationWorker(repository, {
    async getTransaction() {
      polls += 1;
      throw new Error('provider timeout');
    },
  }, {
    intervalMs: 250,
    scheduler: manual.scheduler,
    onResult: (result) => errors.push(...result.errors.map((entry) => entry.reason)),
    onError: (error) => errors.push((error as Error).message),
  });

  worker.start();
  const first = manual.jobs.shift();
  assert.ok(first);
  first.handler();
  await flushAsync();
  assert.deepEqual(errors, ['provider timeout']);
  assert.deepEqual(manual.jobs.map((job) => job.delayMs), [250]);
  assert.equal((await repository.get('financial:worker:error'))?.providerLifecycle, 'UNKNOWN');
  assert.equal(polls, 1);
  worker.stop();
});
