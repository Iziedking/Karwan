import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { PostgresEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { PostgresNegotiationAttemptStore } from '../negotiation/attempts.js';
import {
  DurableTaskRunner,
  PostgresDurableTaskStore,
} from './durableTaskRunner.js';
import {
  createStakeQualificationShadowHandlers,
  createStakeQualificationShadowObserver,
  type StakeQualificationShadowTaskData,
} from './stakeQualificationShadow.js';
import { createStakeFundingResumeObserver } from './stakeFundingResume.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const FUNDING_WALLET = '0x3333333333333333333333333333333333333333';

function data(): StakeQualificationShadowTaskData {
  return {
    dealRoomId: 'room-stake-resume-pg', idempotencyKey: 'stake:room-stake-resume-pg:v1', observedAtUnix: 100,
    source: 'matching-shadow', requirement: {
      requirementVersion: 1, requiredStakeUsdc: '100', stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: FUNDING_WALLET, vaultAddress: '0x2222222222222222222222222222222222222222', asset: 'USDC', network: 'arc-testnet',
    },
    snapshot: { freeStakeUsdc: '25', liquidFundingUsdc: '0', dealRoomOpen: true, mandateVersion: 1, expectedRequirementVersion: 1 },
    policy: { autonomousMaxUsdc: '0', allowedVaults: ['0x2222222222222222222222222222222222222222'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
    blocker: { id: 'blocker-stake-resume-pg', blockerKey: 'stake:room-stake-resume-pg:v1', kind: 'STAKE_SHORTFALL', subject: FUNDING_WALLET, data: {} },
    confirmedFunding: false,
  };
}

test(
  'Postgres funding resume finds only open blockers and resolves one idempotently',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 5 });
    const schema = `karwan_stake_resume_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_stake_resume_[a-f0-9]{32}$/);
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
      const evidence = new PostgresEvidenceRuntimeRepository(client, transaction);
      const rooms = new PostgresAgentRuntimeRepository(client);
      const attempts = new PostgresNegotiationAttemptStore(client);
      await rooms.createDealRoom({ id: 'room-stake-resume-pg', jobId: 'room-stake-resume-pg', data: {}, now: 100 });

      const observeTask = createStakeQualificationShadowObserver(tasks, rooms);
      await observeTask({ data: data() });
      const first = new DurableTaskRunner(
        tasks,
        createStakeQualificationShadowHandlers(evidence, { clock: () => 110 }),
        { workerId: 'stake-pg-initial', clock: () => 110 },
      );
      assert.equal((await first.runOnce(110)).succeeded, 1);
      assert.equal((await evidence.getBlocker('blocker-stake-resume-pg'))?.state, 'open');

      const resume = createStakeFundingResumeObserver(tasks, evidence, rooms);
      const confirmation = {
        agentAddress: FUNDING_WALLET, amountUsdc: '100', movementState: 'completed', observedAtUnix: 200,
        reference: 'kwn-pg-funding-1', txHash: '0x' + 'bb'.repeat(32),
      };
      await resume(confirmation);
      await resume(confirmation);
      const second = new DurableTaskRunner(
        tasks,
        createStakeQualificationShadowHandlers(evidence, { attemptStore: attempts, clock: () => 220 }),
        { workerId: 'stake-pg-resume', clock: () => 220 },
      );
      assert.equal((await second.runOnce(220)).succeeded, 1);
      assert.equal((await evidence.getBlocker('blocker-stake-resume-pg'))?.state, 'resolved');
      const resumed = await attempts.list('room-stake-resume-pg');
      assert.equal(resumed.length, 1);
      assert.equal(resumed[0]?.trigger, 'FUNDS_CONFIRMED');
      assert.equal(resumed[0]?.triggerReference, 'kwn-pg-funding-1');
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_stake_resume_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
