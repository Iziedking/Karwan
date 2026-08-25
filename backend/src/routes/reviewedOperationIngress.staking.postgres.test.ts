import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  createStakeQualificationShadowHandlers,
  createStakeQualificationShadowObserver,
} from '../agents/stakeQualificationShadow.js';
import {
  DurableTaskRunner,
  PostgresDurableTaskStore,
} from '../agents/durableTaskRunner.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresEvidenceRuntimeRepository } from '../evidence/runtime.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
process.env.ADMIN_API_TOKEN = 'reviewed-stake-postgres-test-token';

const {
  configureStakeQualificationShadowIngress,
  reviewedOperationIngressRoutes,
} = await import('./reviewedOperationIngress.js');

const headers = {
  'x-admin-token': 'reviewed-stake-postgres-test-token',
  'content-type': 'application/json',
};

test(
  'Postgres reviewed staking ingress survives duplicate delivery and records a non-executable decision',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_reviewed_stake_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_reviewed_stake_[a-f0-9]{32}$/);
    const client = await pool.connect();
    let disposeIngress: (() => void) | undefined;
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

      const taskStore = new PostgresDurableTaskStore(client, transaction);
      const rooms = new PostgresAgentRuntimeRepository(client);
      const evidence = new PostgresEvidenceRuntimeRepository(client, transaction);
      disposeIngress = configureStakeQualificationShadowIngress(
        async (data) => createStakeQualificationShadowObserver(taskStore, rooms)({ data }),
      );
      const body = {
        dealRoomId: 'room-reviewed-stake-postgres',
        idempotencyKey: 'reviewed-stake-postgres-1',
        observedAtUnix: 100,
        source: 'manual-fixture' as const,
        requirement: {
          requirementVersion: 1,
          requiredStakeUsdc: '500',
          stakeOwner: '0x1111111111111111111111111111111111111111',
          fundingWallet: '0x3333333333333333333333333333333333333333',
          vaultAddress: '0x2222222222222222222222222222222222222222',
          asset: 'USDC' as const,
          network: 'arc-testnet',
        },
        snapshot: {
          freeStakeUsdc: '100',
          liquidFundingUsdc: '400',
          dealRoomOpen: true,
          mandateVersion: 1,
          expectedRequirementVersion: 1,
        },
        policy: {
          autonomousMaxUsdc: '0',
          allowedVaults: ['0x2222222222222222222222222222222222222222'],
          allowedNetworks: ['arc-testnet'],
          allowedAssets: ['USDC'],
        },
        blocker: {
          id: 'blocker-reviewed-stake-postgres',
          blockerKey: 'stake:room-reviewed-stake-postgres:v1',
          kind: 'STAKE_SHORTFALL',
          subject: 'seller-1',
          data: {},
        },
        confirmedFunding: false,
      };

      const first = await reviewedOperationIngressRoutes.request('/staking-shadow', {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      assert.equal(first.status, 202);
      assert.equal((await first.json()).created, true);
      const duplicate = await reviewedOperationIngressRoutes.request('/staking-shadow', {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      assert.equal(duplicate.status, 200);
      assert.equal((await duplicate.json()).created, false);

      const runner = new DurableTaskRunner(
        taskStore,
        createStakeQualificationShadowHandlers(evidence, { approvalRepository: rooms }),
        { workerId: 'reviewed-stake-postgres-worker', clock: () => 200 },
      );
      assert.deepEqual(await runner.runOnce(200), {
        succeeded: 1, waiting: 0, retried: 0, deadLettered: 0, leaseLost: 0,
      });

      const task = await client.query<{ state: string }>(
        'SELECT state FROM agent_tasks WHERE id = $1',
        ['task:stake:qualification:room-reviewed-stake-postgres:reviewed-stake-postgres-1'],
      );
      assert.equal(task.rows[0]?.state, 'succeeded');
      const checkpoint = await client.query<{ data: Record<string, unknown> }>(
        'SELECT data FROM agent_task_checkpoints WHERE task_id = $1',
        ['task:stake:qualification:room-reviewed-stake-postgres:reviewed-stake-postgres-1'],
      );
      assert.equal(checkpoint.rows.length, 1);
      assert.equal(checkpoint.rows[0]?.data.providerCallMade, false);
      assert.equal(checkpoint.rows[0]?.data.financialMutation, false);
      assert.equal((await evidence.getBlockerByKey('stake:room-reviewed-stake-postgres:v1'))?.state, 'open');
    } finally {
      disposeIngress?.();
      await client.query('RESET search_path');
      if (!/^karwan_reviewed_stake_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
