import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres keeps one rating per side of a deal and reads them by deal, ratee and rater',
  { skip: !testDatabaseUrl },
  async () => {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    const schema = `karwan_ratings_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const scopedUrl = new URL(testDatabaseUrl!);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scopedUrl.toString();

    const client = await import('./client.js');
    const { saveRating, ratingsForDeal, ratingsAbout, ratingsBy } = await import('./ratings.js');
    const r = (dealId: string, rater: string, ratee: string, stars: 1 | 2 | 3 | 4 | 5) => ({
      dealId, rater, ratee, stars, note: null, noteHeld: false, settledAt: 1, createdAt: 2,
    });

    try {
      await client.ensureSchema();
      assert.equal(await saveRating(r('D1', '0xB', '0xs', 5)), true);
      assert.equal(await saveRating(r('d1', '0xb', '0xs', 1)), false);
      assert.equal(await saveRating(r('d1', '0xs', '0xb', 4)), true);
      assert.deepEqual((await ratingsForDeal('d1')).map((x) => x.stars).sort(), [4, 5]);
      assert.deepEqual((await ratingsAbout('0xS')).map((x) => x.rater), ['0xb']);
      assert.deepEqual((await ratingsBy('0xS')).map((x) => x.ratee), ['0xb']);
    } finally {
      await client.closePostgresPool();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
