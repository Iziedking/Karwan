import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import type { Contest, ContestEntry } from './contests.js';
import type { WorkOffer, WorkRequest } from './workRequests.js';

/// What a person entered and what they offered on (view 96), read straight
/// from Postgres with the seller indexes of migration 73.

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const BUYER = '0x1111111111111111111111111111111111111111';
const ADA = '0x3333333333333333333333333333333333333333';
const TUNDE = '0x5555555555555555555555555555555555555555';

const contest = (id: string, createdAt: number, status: Contest['status'] = 'open'): Contest => ({
  id, buyer: BUYER, buyerAgent: BUYER, title: `Contest ${id}`, brief: 'A logo', tags: ['logo'], prizeMicros: '300000000', feeBps: 100,
  shares: [10_000], entriesBy: 2_000, awardBy: 3_000, status, createdAt, updatedAt: createdAt,
});
const entry = (id: string, contestId: string, seller: string, status: ContestEntry['status'] = 'in'): ContestEntry => ({
  id, contestId, seller: seller as ContestEntry['seller'], sellerAgent: seller as ContestEntry['sellerAgent'], note: '', previewId: id, files: 1,
  fingerprint: '0x01', status, createdAt: 1, updatedAt: 1,
});
const request = (id: string, createdAt: number, status: WorkRequest['status'] = 'open'): WorkRequest => ({
  id, hirer: BUYER, kind: 'hourly', title: `Work ${id}`, brief: 'Books', keywords: [], maxRateMicros: '10000000', maxHours: 10, periods: 4,
  startsAt: Date.now() + 7 * 86_400_000, status, createdAt, updatedAt: createdAt,
});
const offer = (id: string, requestId: string, seller: string, status: WorkOffer['status'] = 'live'): WorkOffer => ({
  id, requestId, seller: seller as WorkOffer['seller'], sellerAgent: seller as WorkOffer['sellerAgent'], rateMicros: '9000000', note: '', status,
  createdAt: 1, updatedAt: 1,
});

test('Postgres reads the contests a person entered and the open work they offered on', { skip: !testDatabaseUrl }, async () => {
  let cleanup = async () => {};
  {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    const schema = `karwan_v96_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const scoped = new URL(testDatabaseUrl!);
    scoped.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scoped.toString();
    const client = await import('./client.js');
    await client.ensureSchema();
    cleanup = async () => {
      await client.closePostgresPool();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    };
  }
  try {
    const contests = (await import('./contests.js')).postgresContestsStore();
    await contests.create(contest('c_old', 1));
    await contests.create(contest('c_new', 2));
    await contests.create(contest('c_none', 3));
    await contests.createEntry(entry('e_1', 'c_old', ADA));
    await contests.createEntry(entry('e_2', 'c_new', ADA.toUpperCase().replace('0X', '0x')));
    await contests.createEntry(entry('e_3', 'c_none', ADA, 'replaced'));
    await contests.createEntry(entry('e_4', 'c_none', TUNDE));
    assert.deepEqual((await contests.enteredBy(ADA)).map((c) => c.id), ['c_new', 'c_old'], 'newest first, any letter case, a replaced entry does not count');
    assert.deepEqual((await contests.enteredBy(TUNDE)).map((c) => c.id), ['c_none']);
    assert.deepEqual(await contests.enteredBy(BUYER), []);

    const work = (await import('./workRequests.js')).postgresWorkRequestsStore();
    await work.create(request('r_1', 1));
    await work.create(request('r_2', 2));
    await work.create(request('r_hired', 3, 'hired'));
    await work.createOffer(offer('o_1', 'r_1', ADA));
    await work.createOffer(offer('o_2', 'r_2', ADA, 'withdrawn'));
    await work.createOffer(offer('o_3', 'r_hired', ADA));
    assert.deepEqual((await work.offeredBy(ADA)).map((r) => r.id), ['r_1'], 'only open work with a live offer');
    assert.deepEqual(await work.offeredBy(TUNDE), []);
  } finally {
    await cleanup();
  }
});
