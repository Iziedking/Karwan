import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import type { CircleWalletAdapter } from '../circle/CircleWalletAdapter.js';
import { PostgresFinancialRuntimeRepository } from './runtime.js';
import { executeFinancialCommand } from './executor.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { claimFinancialApproval } from './approvalClaim.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres executor persists before submission and never repeats a provider call',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 3 });
    const schema = `karwan_executor_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_executor_[a-f0-9]{32}$/);
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(client);
      const transaction = async <T>(operation: (executor: typeof client) => Promise<T>): Promise<T> => {
        const tx = await pool.connect();
        await tx.query('BEGIN');
        try {
          await tx.query(`SET LOCAL search_path TO "${schema}"`);
          const result = await operation(tx);
          await tx.query('COMMIT');
          return result;
        } catch (error) {
          await tx.query('ROLLBACK');
          throw error;
        } finally {
          tx.release();
        }
      };
      const repository = new PostgresFinancialRuntimeRepository(client, transaction);
      let calls = 0;
      const adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'> = {
        async createTransfer() {
          calls += 1;
          return { providerId: 'circle-executor-1', status: 'INITIATED' as const };
        },
        async executeContract() {
          throw new Error('unexpected contract call');
        },
      };
      const input = {
        command: {
          commandId: 'executor-command-1', idempotencyKey: 'executor:room-1:funding:1', operation: 'ESCROW_FUNDING' as const,
          amountUsdc: '5', sourceAddress: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222',
          expectedDealRoomVersion: 1, mandateVersion: 1, nowUnix: 100,
        },
        policy: { autonomousMaxUsdc: '10', allowedDestinations: ['0x2222222222222222222222222222222222222222'], requireApprovalFor: [] as const },
        current: { dealRoomVersion: 1, mandateVersion: 1 },
        descriptor: { kind: 'transfer' as const, walletId: 'wallet-1', tokenId: 'usdc-token', feeLevel: 'LOW' as const },
        repository,
        adapter,
        now: 100,
      };
      const first = await executeFinancialCommand(input);
      const second = await executeFinancialCommand(input);
      assert.equal(first.status, 'submitted');
      assert.equal(second.status, 'already_recorded');
      assert.equal(calls, 1);
      assert.equal((await repository.get('executor:room-1:funding:1'))?.providerId, 'circle-executor-1');

      const runtime = new PostgresAgentRuntimeRepository(client);
      await runtime.createDealRoom({ id: 'executor-approval-room', jobId: 'executor-approval-job', data: {}, now: 100 });
      const requested = await runtime.createApproval({
        id: 'executor-approval-1',
        dealRoomId: 'executor-approval-room',
        requestKey: 'executor:approval:1',
        kind: 'escrow-funding',
        expiresAt: 2_000,
        data: { amountUsdc: '5', operation: 'ESCROW_FUNDING', destinationAddress: '0x2222222222222222222222222222222222222222' },
        now: 100,
      });
      await runtime.updateApproval(requested.id, requested.version, 'approved', undefined, 101);
      const approvalCommand = {
        commandId: 'executor-approval-command',
        idempotencyKey: 'executor:approval:command',
        operation: 'ESCROW_FUNDING' as const,
        amountUsdc: '5',
        sourceAddress: '0x1111111111111111111111111111111111111111',
        destinationAddress: '0x2222222222222222222222222222222222222222',
        expectedDealRoomVersion: 1,
        mandateVersion: 1,
        nowUnix: 100,
        approvalId: requested.id,
        approvalVersion: 2,
      };
      const claims = await Promise.allSettled([
        claimFinancialApproval(runtime, { command: approvalCommand, executionNow: 102 }),
        claimFinancialApproval(runtime, { command: approvalCommand, executionNow: 103 }),
      ]);
      assert.equal(claims.filter((claim) => claim.status === 'fulfilled').length, 1);
      assert.equal(claims.filter((claim) => claim.status === 'rejected').length, 1);
      assert.equal((await runtime.getApproval(requested.id))?.state, 'executed');
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_executor_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
