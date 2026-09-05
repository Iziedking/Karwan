import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import {
  PostgresResearchAllowanceStore,
  ResearchAllowanceExhaustedError,
  ResearchAllowanceReplayError,
} from './researchAllowance.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const HUMAN = 'a'.repeat(64);
const AGENT_A = '0x1111111111111111111111111111111111111111';
const AGENT_B = '0x2222222222222222222222222222222222222222';

test(
  'Postgres allowance commits only delivered reports, shares the cap, and survives restart',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 12 });
    const schema = `karwan_agentkit_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_agentkit_[a-f0-9]{32}$/);
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(client);
      const transaction = async <T>(operation: (executor: pg.PoolClient) => Promise<T>): Promise<T> => {
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
      const store = new PostgresResearchAllowanceStore(client, transaction);
      for (const [agentAddress, nonce] of [[AGENT_A, 'verify-a'], [AGENT_B, 'verify-b']] as const) {
        await store.verifyBinding({ humanKeyDigest: HUMAN, agentAddress, verifier: 'world-agentbook', checkedAt: 1_000, expiresAt: 100_000, domain: 'karwan.research', nonce, nonceExpiresAt: 10_000, now: 1_000 });
      }
      assert.equal(await store.get({ humanKeyDigest: HUMAN, now: 1_000 }), null);
      await assert.rejects(
        () => store.verifyBinding({ humanKeyDigest: HUMAN, agentAddress: AGENT_A, verifier: 'world-agentbook', checkedAt: 1_001, expiresAt: 100_000, domain: 'karwan.research', nonce: 'verify-a', nonceExpiresAt: 10_000, now: 1_001 }),
        ResearchAllowanceReplayError,
      );

      const reservations = await Promise.all([0, 1, 2].map((index) => store.reserve({
        agentAddress: index % 2 === 0 ? AGENT_A : AGENT_B,
        requestId: `request-${index}`,
        resourceId: `deal:${index}:counterparty`,
        now: 2_000,
      })));
      assert.deepEqual(reservations.map((item) => item.snapshot.reserved).sort(), [1, 2, 3]);
      await assert.rejects(
        () => store.reserve({ agentAddress: AGENT_B, requestId: 'request-3', resourceId: 'deal:3:counterparty', now: 2_001 }),
        ResearchAllowanceExhaustedError,
      );

      await store.release({ reservationId: reservations[0]!.reservation.id, reason: 'provider unavailable', now: 2_100 });
      const replacement = await store.reserve({ agentAddress: AGENT_B, requestId: 'request-3', resourceId: 'deal:3:counterparty', now: 2_101 });
      for (const [index, item] of [reservations[1]!, reservations[2]!, replacement].entries()) {
        await store.commit({ reservationId: item.reservation.id, resultId: `report-${index}`, now: 3_000 + index });
      }

      const restarted = new PostgresResearchAllowanceStore(client, transaction);
      assert.equal((await restarted.get({ humanKeyDigest: HUMAN, now: 4_000 }))?.used, 3);
      assert.equal((await restarted.listBindings(HUMAN)).length, 2);
      assert.equal((await restarted.getDelivered({ agentAddress: AGENT_B, resourceId: 'deal:1:counterparty' }))?.resultId, 'report-0');
      const retry = await restarted.reserve({ agentAddress: AGENT_A, requestId: 'another-request', resourceId: 'deal:1:counterparty', now: 4_001 });
      assert.equal(retry.created, false);
      assert.equal(retry.reservation.state, 'delivered');
      const same = await restarted.commit({ reservationId: retry.reservation.id, resultId: 'report-0', now: 4_002 });
      assert.equal(same.snapshot.used, 3);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_agentkit_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
