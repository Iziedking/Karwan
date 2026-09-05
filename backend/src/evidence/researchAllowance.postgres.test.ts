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

test(
  'Postgres AgentKit allowance shares across agents, rejects replay, and survives store restart',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
    const schema = `karwan_agentkit_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_agentkit_[a-f0-9]{32}$/);
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
      const humanKeyDigest = 'a'.repeat(64);
      const agentA = '0x1111111111111111111111111111111111111111';
      const agentB = '0x2222222222222222222222222222222222222222';
      const store = new PostgresResearchAllowanceStore(client, transaction);
      const results = await Promise.all([
        store.consume({ humanKeyDigest, agentAddress: agentA, domain: 'karwan.research', nonce: 'a-1', nonceExpiresAt: 10_000, now: 1_000 }),
        store.consume({ humanKeyDigest, agentAddress: agentB, domain: 'karwan.research', nonce: 'b-1', nonceExpiresAt: 10_000, now: 1_000 }),
      ]);
      assert.deepEqual(results.map((result) => result.snapshot.used).sort(), [1, 2]);
      await store.recordBinding({ agentAddress: agentA, humanKeyDigest, verifier: 'world-agentbook', checkedAt: 1_000, expiresAt: 10_000, now: 1_000 });
      await store.recordBinding({ agentAddress: agentB, humanKeyDigest, verifier: 'world-agentbook', checkedAt: 1_000, expiresAt: 10_000, now: 1_000 });
      const restarted = new PostgresResearchAllowanceStore(client, transaction);
      assert.equal((await restarted.get({ humanKeyDigest, now: 1_000 }))?.used, 2);
      assert.equal((await restarted.listBindings(humanKeyDigest)).length, 2);
      await assert.rejects(
        () => restarted.consume({ humanKeyDigest, agentAddress: agentA, domain: 'karwan.research', nonce: 'a-1', nonceExpiresAt: 10_000, now: 1_001 }),
        ResearchAllowanceReplayError,
      );
      await restarted.consume({ humanKeyDigest, agentAddress: agentA, domain: 'karwan.research', nonce: 'a-2', nonceExpiresAt: 10_000, now: 1_002 });
      await assert.rejects(
        () => restarted.consume({ humanKeyDigest, agentAddress: agentB, domain: 'karwan.research', nonce: 'b-2', nonceExpiresAt: 10_000, now: 1_003 }),
        ResearchAllowanceExhaustedError,
      );
      assert.equal((await restarted.get({ humanKeyDigest, now: 1_003 }))?.used, 3);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_agentkit_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
