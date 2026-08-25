import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { PostgresFinancialRuntimeRepository } from '../financial/runtime.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { DurableTaskRunner, PostgresDurableTaskStore } from './durableTaskRunner.js';
import {
  createFinancialCommandShadowHandlers,
  createFinancialCommandShadowObserver,
} from './financialCommandShadow.js';
import {
  createStakeQualificationShadowHandlers,
  createStakeQualificationShadowObserver,
} from './stakeQualificationShadow.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres stake qualification projects one durable financial shadow command without provider activity',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_stake_financial_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_stake_financial_[a-f0-9]{32}$/);
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
      const financial = new PostgresFinancialRuntimeRepository(client, transaction);
      const rooms = new PostgresAgentRuntimeRepository(client);
      const financialObserver = createFinancialCommandShadowObserver(tasks, rooms);
      const handlers = {
        ...createStakeQualificationShadowHandlers(evidence, { financialObserver, clock: () => 200 }),
        ...createFinancialCommandShadowHandlers(financial, { clock: () => 200 }),
      };
      const input = {
        dealRoomId: 'room-stake-financial-postgres',
        idempotencyKey: 'stake:financial-postgres:1',
        observedAtUnix: 100,
        source: 'manual-fixture' as const,
        requirement: {
          requirementVersion: 1, requiredStakeUsdc: '100',
          stakeOwner: '0x1111111111111111111111111111111111111111',
          fundingWallet: '0x3333333333333333333333333333333333333333',
          vaultAddress: '0x2222222222222222222222222222222222222222',
          asset: 'USDC' as const, network: 'arc-testnet',
        },
        snapshot: {
          freeStakeUsdc: '25', liquidFundingUsdc: '0', dealRoomOpen: true,
          mandateVersion: 1, expectedRequirementVersion: 1,
        },
        policy: {
          autonomousMaxUsdc: '50',
          allowedVaults: ['0x2222222222222222222222222222222222222222'],
          allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'],
        },
        blocker: {
          id: 'blocker-stake-financial-postgres', blockerKey: 'stake:financial:postgres:1',
          kind: 'STAKE_SHORTFALL', subject: 'seller-1', data: {},
        },
      };
      await createStakeQualificationShadowObserver(tasks, rooms)({ data: input });
      const runner = new DurableTaskRunner(tasks, handlers, {
        workerId: 'stake-financial-postgres',
        clock: () => 200,
      });
      assert.equal((await runner.runOnce(200)).succeeded, 1);
      assert.equal((await runner.runOnce(200)).succeeded, 1);
      const rows = await client.query<{ idempotency_key: string; decision: string; provider_lifecycle: string }>(
        `SELECT idempotency_key, decision, provider_lifecycle FROM "${schema}".financial_commands_v2`,
      );
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0]?.decision, 'APPROVAL_REQUIRED');
      assert.equal(rows.rows[0]?.provider_lifecycle, 'CREATED');
      assert.match(rows.rows[0]?.idempotency_key ?? '', /^legacy-stake:/);
      const tasksRows = await client.query<{ kind: string; state: string }>(
        `SELECT kind, state FROM "${schema}".agent_tasks WHERE kind = 'financial.command.shadow'`,
      );
      assert.deepEqual(tasksRows.rows, [{ kind: 'financial.command.shadow', state: 'succeeded' }]);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_stake_financial_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
