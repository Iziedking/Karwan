import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { domainEventLiveBus, PostgresDomainEventStore } from '../events/domainEventStore.js';
import {
  OutboxDispatcher,
  PostgresOutboxStore,
  createBrowserProjectionConsumer,
} from '../events/outboxWorker.js';
import { PostgresNegotiationRuntime } from './postgresRuntime.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

function offer(version: number, id: string, price = '125') {
  return {
    dealRoomId: 'room-1', offerId: id, offerVersion: version,
    senderRole: 'buyer' as const, recipientRole: 'seller' as const,
    kind: version === 1 ? 'OPENING' as const : 'COUNTER' as const,
    action: 'REVISE_PRICE' as const, priceUsdc: price, deadlineUnix: 2_000,
    buyerMandateVersion: 3, sellerMandateVersion: 4,
    ...(version === 1 ? {} : { previousOfferId: `offer-${version - 1}`, previousOfferVersion: version - 1 }),
    terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
  };
}

test(
  'Postgres negotiation adapter supersedes, fences stale acceptance, and replays commands',
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    const schema = `karwan_negotiation_${randomUUID().replaceAll('-', '')}`;
    try {
      const setup = await pool.connect();
      try {
        await setup.query(`CREATE SCHEMA "${schema}"`);
        await setup.query(`SET search_path TO "${schema}"`);
        await runNumberedMigrations(setup);
        await setup.query(
          `INSERT INTO deal_rooms (id, job_id, state, version, created_at, updated_at, data)
           VALUES ('room-1', 'job-1', 'open', 1, 100, 100, $1)`,
          [{ buyerMandateVersion: 3, sellerMandateVersion: 4 }],
        );
      } finally {
        setup.release();
      }
      const transaction = async <T>(operation: (executor: pg.PoolClient) => Promise<T>): Promise<T> => {
        const client = await pool.connect();
        await client.query(`SET search_path TO "${schema}"`);
        await client.query('BEGIN');
        try {
          const value = await operation(client);
          await client.query('COMMIT');
          return value;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };
      const runtime = new PostgresNegotiationRuntime(transaction);
      const mandates = { buyerMaxPriceUsdc: '150', sellerMinPriceUsdc: '100', buyerMandateVersion: 3, sellerMandateVersion: 4 };
      const boundaryClient = await pool.connect();
      try {
        await boundaryClient.query(`SET search_path TO "${schema}"`);
        await assert.rejects(
          () => new PostgresDomainEventStore(boundaryClient, transaction).mutateDealRoom({
          eventId: 'event-malformed-offer',
          dealRoomId: 'room-1',
          expectedVersion: 1,
          nextState: 'qualifying',
          category: 'negotiation',
          type: 'negotiation.offer.published',
          actor: 'platform',
          payload: { malformed: true },
          structuredOffer: {
            id: 'offer-malformed',
            version: 1,
            amountUsdc: '125',
            updatedAt: 100,
            buyerMandateVersion: 0,
            sellerMandateVersion: 4,
          },
          now: 100,
          }),
          /buyer mandate version must be a positive integer/,
        );
      } finally {
        boundaryClient.release();
      }
      const untouchedRoom = await pool.query<{ version: string; last_sequence: string }>(
        `SELECT version, last_sequence FROM "${schema}".deal_rooms WHERE id = 'room-1'`,
      );
      assert.deepEqual(untouchedRoom.rows[0], { version: '1', last_sequence: '0' });
      const malformedRows = await pool.query<{ count: string }>(
        `SELECT count(*) FROM "${schema}".domain_events_v2 WHERE id = 'event-malformed-offer'`,
      );
      assert.equal(malformedRows.rows[0]?.count, '0');
      const first = await runtime.publishOffer({ commandId: 'cmd-offer-1', idempotencyKey: 'offer:room-1:1', expectedDealRoomVersion: 1, rawOffer: offer(1, 'offer-1'), mandates, nowUnix: 100 });
      assert.equal(first.outcome, 'published');
      const second = await runtime.publishOffer({ commandId: 'cmd-offer-2', idempotencyKey: 'offer:room-1:2', expectedDealRoomVersion: 2, rawOffer: offer(2, 'offer-2', '130'), mandates, nowUnix: 200 });
      assert.equal(second.outcome, 'published');
      const duplicate = await runtime.publishOffer({ commandId: 'cmd-offer-retry', idempotencyKey: 'offer:room-1:2', expectedDealRoomVersion: 2, rawOffer: offer(2, 'offer-2', '130'), mandates, nowUnix: 999 });
      assert.deepEqual(duplicate, second);
      const repeatedTerms = await runtime.publishOffer({ commandId: 'cmd-offer-3', idempotencyKey: 'offer:room-1:3', expectedDealRoomVersion: 3, rawOffer: offer(3, 'offer-3', '130'), mandates, nowUnix: 250 });
      assert.equal(repeatedTerms.outcome, 'stale');
      if (repeatedTerms.outcome === 'stale') assert.equal(repeatedTerms.reason, 'STALE_OFFER');
      const stale = await runtime.accept({ commandId: 'cmd-accept-stale', idempotencyKey: 'accept:room-1:1', dealRoomId: 'room-1', expectedDealRoomVersion: 2, offerId: 'offer-1', offerVersion: 1, buyerMandateVersion: 3, sellerMandateVersion: 4, nowUnix: 300 });
      assert.equal(stale.outcome, 'stale');
      if (stale.outcome === 'stale') assert.equal(stale.reason, 'STALE_OFFER');
      const accepted = await runtime.accept({ commandId: 'cmd-accept-2', idempotencyKey: 'accept:room-1:2', dealRoomId: 'room-1', expectedDealRoomVersion: 3, offerId: 'offer-2', offerVersion: 2, buyerMandateVersion: 3, sellerMandateVersion: 4, nowUnix: 400 });
      assert.equal(accepted.outcome, 'accepted');
      assert.deepEqual(await runtime.accept({ commandId: 'cmd-accept-retry', idempotencyKey: 'accept:room-1:2', dealRoomId: 'room-1', expectedDealRoomVersion: 3, offerId: 'offer-2', offerVersion: 2, buyerMandateVersion: 3, sellerMandateVersion: 4, nowUnix: 999 }), accepted);
      const browserDeliveries: string[] = [];
      const unsubscribe = domainEventLiveBus.subscribe((event) => browserDeliveries.push(`${event.type}:${event.sequence}`));
      try {
        const dispatcher = new OutboxDispatcher(
          new PostgresOutboxStore(transaction),
          [createBrowserProjectionConsumer(transaction)],
          { workerId: 'negotiation-browser-test', batchSize: 10 },
        );
        assert.deepEqual(await dispatcher.dispatchOnce(500), { delivered: 3, retried: 0, deadLettered: 0 });
      } finally {
        unsubscribe();
      }
      assert.deepEqual(browserDeliveries, [
        'negotiation.offer.published:1',
        'negotiation.offer.published:2',
        'negotiation.offer.accepted:3',
      ]);
      const inspect = await pool.connect();
      try {
        await inspect.query(`SET search_path TO "${schema}"`);
        const events = await inspect.query<{ id: string; type: string; aggregate_version: number | string; sequence: number | string; data: { structuredOffer?: { id: string; version: number; amountUsdc: string; buyerMandateVersion?: number; sellerMandateVersion?: number } } }>(
          'SELECT id, type, aggregate_version, sequence, data FROM domain_events_v2 ORDER BY sequence',
        );
        assert.deepEqual(events.rows.map((row) => [row.type, Number(row.aggregate_version), Number(row.sequence)]), [
          ['negotiation.offer.published', 2, 1],
          ['negotiation.offer.published', 3, 2],
          ['negotiation.offer.accepted', 4, 3],
        ]);
        assert.deepEqual(events.rows.map((row) => row.data.structuredOffer?.id), ['offer-1', 'offer-2', 'offer-2']);
        assert.deepEqual(events.rows.map((row) => row.data.structuredOffer?.amountUsdc), ['125', '130', '130']);
        assert.deepEqual(events.rows.map((row) => [
          row.data.structuredOffer?.buyerMandateVersion,
          row.data.structuredOffer?.sellerMandateVersion,
        ]), [[3, 4], [3, 4], [3, 4]]);
        const outbox = await inspect.query<{ event_id: string; state: string }>(
          'SELECT event_id, state FROM event_outbox_v2 ORDER BY created_at, id',
        );
        assert.equal(outbox.rows.length, 3);
        assert.ok(outbox.rows.every((row) => row.state === 'delivered'));
        const room = await inspect.query<{ version: number | string; last_sequence: number | string }>(
          'SELECT version, last_sequence FROM deal_rooms WHERE id = $1',
          ['room-1'],
        );
        assert.deepEqual(room.rows.map((row) => [Number(row.version), Number(row.last_sequence)]), [[4, 3]]);
      } finally {
        inspect.release();
      }
    } finally {
      const cleanup = await pool.connect();
      try {
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        cleanup.release();
        await pool.end();
      }
    }
  },
);
