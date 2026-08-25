import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations, type SqlExecutor } from '../db/migrations.js';
import {
  PostgresDomainEventStore,
  domainEventLiveBus,
  type TransactionRunner,
} from './domainEventStore.js';
import {
  OutboxDispatcher,
  PostgresOutboxStore,
  createBrowserProjectionConsumer,
  createNotificationJobConsumer,
} from './outboxWorker.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'DealRoom mutation, replay, crash recovery, and consumer dedupe are durable',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 3 });
    const schema = `karwan_events_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_events_[a-f0-9]{32}$/);
    const client = await pool.connect();
    const transaction: TransactionRunner = async <T>(operation: (executor: SqlExecutor) => Promise<T>) => {
      await client.query('BEGIN');
      try {
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    };

    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(client);
      await client.query(
        `INSERT INTO deal_rooms (
           id, job_id, state, version, last_sequence, created_at, updated_at, data
         ) VALUES ('room-1', 'job-1', 'open', 1, 0, 100, 100, '{}')`,
      );
      const store = new PostgresDomainEventStore(client, transaction);
      const firstInput = {
        eventId: 'event-1',
        dealRoomId: 'room-1',
        expectedVersion: 1,
        nextState: 'qualifying' as const,
        category: 'deal_room',
        type: 'deal.room.state.changed' as const,
        actor: 'platform' as const,
        payload: { state: 'qualifying' },
        now: 200,
      };
      const first = await store.mutateDealRoom(firstInput);
      assert.equal(first.replayed, false);
      assert.equal(first.room.version, 2);
      assert.equal(first.event.sequence, 1);

      const replayedCommand = await store.mutateDealRoom(firstInput);
      assert.equal(replayedCommand.replayed, true);
      assert.equal(replayedCommand.room.version, 2);

      const second = await store.mutateDealRoom({
        ...firstInput,
        eventId: 'event-2',
        expectedVersion: 2,
        nextState: 'qualified',
        payload: { state: 'qualified' },
        now: 300,
      });
      assert.equal(second.event.sequence, 2);
      assert.deepEqual((await store.listAfterSequence('room-1', 1)).map((e) => e.sequence), [2]);
      assert.deepEqual((await store.listAfterJobSequence('job-1', 0)).map((e) => e.sequence), [1, 2]);

      const outbox = new PostgresOutboxStore(transaction);
      const notification = createNotificationJobConsumer(transaction);
      const browser = createBrowserProjectionConsumer(transaction);
      let browserDeliveries = 0;
      const unsub = domainEventLiveBus.subscribe(() => {
        browserDeliveries += 1;
      });
      let simulateCrash = true;
      const dispatcher = new OutboxDispatcher(outbox, [notification, browser], {
        workerId: 'worker-1',
        maxAttempts: 4,
        baseBackoffMs: 10,
        batchSize: 2,
        afterConsumers: async () => {
          if (simulateCrash) throw new Error('crash after consumer commits');
        },
      });
      try {
        assert.equal((await dispatcher.dispatchOnce(400)).retried, 2);
        simulateCrash = false;
        assert.equal((await dispatcher.dispatchOnce(410)).delivered, 2);
      } finally {
        unsub();
      }
      const notificationCount = await client.query<{ count: string }>(
        'SELECT count(*) FROM notification_jobs_v2 WHERE event_id = $1',
        ['event-1'],
      );
      assert.equal(Number(notificationCount.rows[0]?.count), 1);
      assert.equal(browserDeliveries, 2);
      const outboxState = await client.query<{ state: string; attempt: string }>(
        'SELECT state, attempt FROM event_outbox_v2 WHERE event_id = $1',
        ['event-1'],
      );
      assert.deepEqual(outboxState.rows[0], { state: 'delivered', attempt: '2' });

      await client.query(
        `INSERT INTO deal_rooms (
           id, job_id, state, version, last_sequence, created_at, updated_at, data
         ) VALUES ('room-reconnect', 'job-reconnect', 'qualifying', 1, 238, 500, 500, '{}')`,
      );
      const sequence239 = await store.mutateDealRoom({
        eventId: 'event-239',
        dealRoomId: 'room-reconnect',
        expectedVersion: 1,
        nextState: 'qualifying',
        category: 'deal_room',
        type: 'deal.room.state.changed',
        actor: 'platform',
        payload: { state: 'qualifying' },
        now: 501,
      });
      const sequence240 = await store.mutateDealRoom({
        eventId: 'event-240',
        dealRoomId: 'room-reconnect',
        expectedVersion: 2,
        nextState: 'qualifying',
        category: 'deal_room',
        type: 'deal.room.state.changed',
        actor: 'platform',
        payload: { state: 'qualifying' },
        now: 502,
      });
      assert.equal(sequence239.event.sequence, 239);
      assert.equal(sequence240.event.sequence, 240);
      assert.equal((await store.getDealRoom('room-reconnect'))?.lastSequence, 240);
      assert.deepEqual(
        (await store.listAfterSequence('room-reconnect', 238)).map((event) => event.sequence),
        [239, 240],
      );

      await client.query(
        `INSERT INTO deal_rooms (
           id, job_id, state, version, last_sequence, created_at, updated_at, data
         ) VALUES ('room-concurrent', 'job-concurrent', 'open', 1, 0, 600, 600, '{}')`,
      );
      const concurrentTransaction: TransactionRunner = async <T>(
        operation: (executor: SqlExecutor) => Promise<T>,
      ) => {
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
      const concurrentStore = new PostgresDomainEventStore(client, concurrentTransaction);
      const concurrentInput = {
        eventId: 'event-concurrent',
        dealRoomId: 'room-concurrent',
        expectedVersion: 1,
        nextState: 'qualifying' as const,
        category: 'deal_room',
        type: 'deal.room.state.changed' as const,
        actor: 'platform' as const,
        payload: { state: 'qualifying' },
        now: 601,
      };
      const concurrentResults = await Promise.all([
        concurrentStore.mutateDealRoom(concurrentInput),
        concurrentStore.mutateDealRoom(concurrentInput),
      ]);
      assert.deepEqual(
        concurrentResults.map((result) => result.replayed).sort(),
        [false, true],
      );
      const concurrentCounts = await client.query<{ events: string; outbox: string }>(
        `SELECT
           (SELECT count(*) FROM domain_events_v2 WHERE id = 'event-concurrent') AS events,
           (SELECT count(*) FROM event_outbox_v2 WHERE event_id = 'event-concurrent') AS outbox`,
      );
      assert.deepEqual(concurrentCounts.rows[0], { events: '1', outbox: '1' });
    } finally {
      if (!/^karwan_events_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
