import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { PostgresNegotiationAttemptStore } from '../negotiation/attempts.js';
import { DurableTaskRunner, PostgresDurableTaskStore } from './durableTaskRunner.js';
import { createStakeQualificationShadowHandlers, createStakeQualificationShadowObserver } from './stakeQualificationShadow.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres stake qualification shadow persists and resolves one blocker after funding confirmation',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_stake_shadow_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_stake_shadow_[a-f0-9]{32}$/);
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
      const tasks = new PostgresDurableTaskStore(client, transaction);
      const repository = new PostgresEvidenceRuntimeRepository(client, transaction);
      const approvals = new PostgresAgentRuntimeRepository(client);
      const attempts = new PostgresNegotiationAttemptStore(client);
      const observe = createStakeQualificationShadowObserver(tasks, approvals);
      const base = {
        dealRoomId: 'room-stake-shadow', source: 'manual-fixture' as const, observedAtUnix: 100,
        requirement: { requirementVersion: 1, requiredStakeUsdc: '100', stakeOwner: '0x1111111111111111111111111111111111111111', fundingWallet: '0x3333333333333333333333333333333333333333', vaultAddress: '0x2222222222222222222222222222222222222222', asset: 'USDC' as const, network: 'arc-testnet' },
        snapshot: { freeStakeUsdc: '25', liquidFundingUsdc: '0', dealRoomOpen: true, mandateVersion: 1, expectedRequirementVersion: 1 },
        policy: { autonomousMaxUsdc: '50', allowedVaults: ['0x2222222222222222222222222222222222222222'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
        blocker: { id: 'blocker-stake-shadow', blockerKey: 'stake:shadow:1', kind: 'STAKE_SHORTFALL', subject: 'seller-1', data: {} },
      };
      await observe({ data: { ...base, idempotencyKey: 'stake:shadow:initial' } });
      const first = new DurableTaskRunner(tasks, createStakeQualificationShadowHandlers(repository, { attemptStore: attempts, clock: () => 200 }), { workerId: 'stake-shadow-1', clock: () => 200 });
      assert.equal((await first.runOnce(200)).succeeded, 1);
      assert.equal((await repository.getBlocker('blocker-stake-shadow'))?.state, 'open');
      await observe({ data: { ...base, idempotencyKey: 'stake:shadow:funded', source: 'funding-confirmed', confirmedFunding: true, snapshot: { ...base.snapshot, liquidFundingUsdc: '100' }, resume: { attemptId: 'attempt-stake-shadow-resume', attemptNumber: 2, triggerReference: 'funding:receipt-shadow', strategy: { mode: 'resume-prior-history' } } } });
      const second = new DurableTaskRunner(tasks, createStakeQualificationShadowHandlers(repository, { attemptStore: attempts, clock: () => 300 }), { workerId: 'stake-shadow-2', clock: () => 300 });
      assert.equal((await second.runOnce(300)).succeeded, 1);
      assert.equal((await repository.getBlocker('blocker-stake-shadow'))?.state, 'resolved');
      const resumed = await attempts.list('room-stake-shadow');
      assert.equal(resumed.length, 1);
      assert.equal(resumed[0]?.trigger, 'FUNDS_CONFIRMED');

      const approvalBase = {
        dealRoomId: 'room-stake-approval', source: 'manual-fixture' as const, observedAtUnix: 100,
        requirement: { requirementVersion: 2, requiredStakeUsdc: '500', stakeOwner: '0x1111111111111111111111111111111111111111', fundingWallet: '0x3333333333333333333333333333333333333333', vaultAddress: '0x2222222222222222222222222222222222222222', asset: 'USDC' as const, network: 'arc-testnet' },
        snapshot: { freeStakeUsdc: '0', liquidFundingUsdc: '500', dealRoomOpen: true, mandateVersion: 3, expectedRequirementVersion: 2 },
        policy: { autonomousMaxUsdc: '250', allowedVaults: ['0x2222222222222222222222222222222222222222'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
        blocker: { id: 'blocker-stake-approval', blockerKey: 'stake:approval:1', kind: 'STAKE_APPROVAL', subject: 'seller-1', data: {} },
      };
      await observe({ data: { ...approvalBase, idempotencyKey: 'stake:approval:1' } });
      const approvalRunner = new DurableTaskRunner(tasks, createStakeQualificationShadowHandlers(repository, { approvalRepository: approvals, attemptStore: attempts, clock: () => 200 }), { workerId: 'stake-approval-worker', clock: () => 200 });
      assert.equal((await approvalRunner.runOnce(200)).succeeded, 1);
      const approval = await approvals.getApproval('approval:stake:room-stake-approval:requirement:2:shortfall:500:mandate:3');
      assert.equal(approval?.state, 'requested');
      assert.equal((approval?.data as { amountUsdc?: string }).amountUsdc, '500');
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_stake_shadow_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
