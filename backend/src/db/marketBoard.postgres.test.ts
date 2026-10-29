import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import type { Address, Hex, Log } from 'viem';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const BUYER: Address = '0x1111111111111111111111111111111111111111';
const SELLER: Address = '0x2222222222222222222222222222222222222222';
const SALT: Hex = '0x00000000000000000000000000000000000000000000000000000000000000bb';

test(
  'Postgres keeps the market board: one request per number, steps in order, a restart picks up where it was',
  { skip: !testDatabaseUrl },
  async () => {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    const schema = `karwan_board_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const scopedUrl = new URL(testDatabaseUrl!);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scopedUrl.toString();

    const client = await import('./client.js');
    const { postgresBoardStore } = await import('./marketBoard.js');
    const { createKarwanBoard, BoardError } = await import('../marketplace/board.js');
    const chain = { request: async () => null, offer: async () => null, counter: async () => null };
    const now = Math.floor(Date.now() / 1000);
    const fresh = () => createKarwanBoard({ store: postgresBoardStore(), chain, now: () => now });

    try {
      await client.ensureSchema();
      const board = fresh();
      const post = () => board.postRequest({ walletId: 'w', poster: BUYER, salt: SALT, budget: 5n, deadline: BigInt(now + 3600), termsHash: 't' });
      const both = await Promise.allSettled([post(), post()]);
      assert.equal(both.filter((r) => r.status === 'fulfilled').length, 1, 'two posts of one number: one stands');
      const lost = both.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      assert.ok(lost.reason instanceof BoardError && lost.reason.code === 'JobAlreadyExists');
      const { jobId } = (both.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ jobId: Hex }>).value;

      const restarted = fresh();
      const seen: Log[] = [];
      restarted.watch('BidSubmitted', (logs) => seen.push(...logs), () => {});
      await restarted.ready();
      await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 4n, deadline: BigInt(now + 3600) });
      await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 3n, deadline: BigInt(now + 3600) });
      await restarted.pollOnce();
      assert.deepEqual(seen.map((l) => (l as unknown as { args: { price: bigint } }).args.price), [4n, 3n], 'in order, from the shared records');

      await restarted.accept({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER });
      const r = await board.read(jobId);
      assert.equal(r?.state, 2);
      assert.equal(r?.acceptedPrice, 3n);
      assert.equal((await restarted.recentPosted({ blocks: 0n, ms: 60_000 })).length, 1);
    } finally {
      await client.closePostgresPool();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
