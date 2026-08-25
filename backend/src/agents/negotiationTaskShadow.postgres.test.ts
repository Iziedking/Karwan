import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { DurableTaskRunner, PostgresDurableTaskStore } from './durableTaskRunner.js';
import {
  createNegotiationShadowHandlers,
  createNegotiationShadowObserver,
} from './negotiationTaskShadow.js';
import { PostgresMandateSnapshotStore } from '../negotiation/mandates.js';
import { PostgresNegotiationRuntime } from '../negotiation/postgresRuntime.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres negotiation shadow observer seeds the room before task insertion',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_negotiation_shadow_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_negotiation_shadow_[a-f0-9]{32}$/);
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
      const rooms = new PostgresAgentRuntimeRepository(client);
      const mandates = new PostgresMandateSnapshotStore(client);
      const observe = createNegotiationShadowObserver(tasks, rooms, mandates);
      const data = {
        dealRoomId: 'room-negotiation-shadow',
        commandId: 'command-negotiation-shadow',
        idempotencyKey: 'negotiation:shadow:1',
        expectedDealRoomVersion: 1,
        rawOffer: {
          dealRoomId: 'room-negotiation-shadow', offerId: 'offer-negotiation-shadow', offerVersion: 1,
          senderRole: 'buyer' as const, recipientRole: 'seller' as const, kind: 'OPENING' as const,
          action: 'REVISE_PRICE' as const, priceUsdc: '125', deadlineUnix: 2_000,
          buyerMandateVersion: 1, sellerMandateVersion: 1,
          terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
        },
        mandates: { buyerMaxPriceUsdc: '150', sellerMinPriceUsdc: '100', buyerMandateVersion: 1, sellerMandateVersion: 1 },
        observedAtUnix: 100,
        source: 'legacy-proposal' as const,
      };
      await observe({ data });
      await observe({ data });
      const seededRoom = await rooms.getDealRoom(data.dealRoomId);
      assert.equal(seededRoom?.state, 'open');
      assert.deepEqual(
        {
          buyerMandateVersion: seededRoom?.data.buyerMandateVersion,
          sellerMandateVersion: seededRoom?.data.sellerMandateVersion,
        },
        { buyerMandateVersion: 1, sellerMandateVersion: 1 },
      );
      const mandateRows = await client.query<{ role: string; mandate_version: number | string }>(
        'SELECT role, mandate_version FROM negotiation_mandates_v2 ORDER BY role',
      );
      assert.deepEqual(mandateRows.rows.map((row) => [row.role, Number(row.mandate_version)]), [['BUYER', 1], ['SELLER', 1]]);

      const offerRuntime = new PostgresNegotiationRuntime(transaction);
      const runner = new DurableTaskRunner(
        tasks,
        createNegotiationShadowHandlers({ clock: () => 200, offerRuntime }),
        { workerId: 'negotiation-shadow-postgres-worker', clock: () => 200 },
      );
      assert.equal((await runner.runOnce(200)).succeeded, 1);
      const checkpoints = await tasks.listCheckpoints('task:negotiation:turn:room-negotiation-shadow:offer-negotiation-shadow');
      assert.equal(checkpoints.length, 1);
      const offerRows = await client.query<{ state: string; offer_version: number | string }>(
        'SELECT state, offer_version FROM offers WHERE id = $1',
        [data.rawOffer.offerId],
      );
      assert.deepEqual(offerRows.rows.map((row) => [row.state, Number(row.offer_version)]), [['proposed', 1]]);
      const events = await client.query<{ type: string; aggregate_version: number | string; sequence: number | string; data: { structuredOffer?: { id: string; version: number; amountUsdc: string; buyerMandateVersion?: number; sellerMandateVersion?: number } } }>(
        'SELECT type, aggregate_version, sequence, data FROM domain_events_v2 WHERE aggregate_id = $1 ORDER BY sequence',
        [data.dealRoomId],
      );
      assert.deepEqual(events.rows.map((row) => [row.type, Number(row.aggregate_version), Number(row.sequence)]), [
        ['negotiation.offer.published', 2, 1],
      ]);
      assert.deepEqual(events.rows[0]?.data.structuredOffer, {
        id: data.rawOffer.offerId,
        version: 1,
        amountUsdc: '125',
        updatedAt: 100,
        deadlineUnix: 2_000,
        buyerMandateVersion: 1,
        sellerMandateVersion: 1,
      });
      const outbox = await client.query<{ event_id: string; state: string }>(
        'SELECT event_id, state FROM event_outbox_v2 WHERE event_id = $1',
        [`negotiation:${data.idempotencyKey}:offer-published`],
      );
      assert.deepEqual(outbox.rows.map((row) => row.state), ['pending']);
      const roomAfter = await rooms.getDealRoom(data.dealRoomId);
      assert.equal(roomAfter?.state, 'negotiating');
      assert.equal(roomAfter?.version, 2);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_negotiation_shadow_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
