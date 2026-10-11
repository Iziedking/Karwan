import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { NUMBERED_MIGRATIONS, type SqlExecutor } from '../db/migrations.js';
import { ADDRESS_WAIT_MS, DAILY_LIMIT_MICROS } from './rules.js';
import { createMemoryMoneyOutStore, createPostgresMoneyOutStore, type MoneyOutStore } from './store.js';

const url = process.env.TEST_DATABASE_URL;
const WALLET = '0x00000000000000000000000000000000000000aa';
const DEST = '0x00000000000000000000000000000000000000BB';
const usdc = (n: number) => BigInt(n) * 1_000_000n;

async function withSchema(run: (store: MoneyOutStore) => Promise<void>) {
  const schema = `money_out_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^money_out_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
  const transaction = async <T>(fn: (tx: SqlExecutor) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn({ query: (sql, params) => client.query(sql, params ? [...params] : []) });
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  try {
    await pool.query(NUMBERED_MIGRATIONS.find((m) => m.name === 'money_out_guard')!.sql);
    await run(createPostgresMoneyOutStore(transaction));
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

async function contract(store: MoneyOutStore) {
  const a = await store.addAddress(WALLET, 'arc', DEST, 1_000);
  assert.equal(a.address, DEST.toLowerCase());
  assert.equal(a.opensAt, 1_000 + ADDRESS_WAIT_MS);
  const again = await store.addAddress(WALLET, 'arc', DEST, 5_000);
  assert.equal(again.id, a.id, 'saving a live address again keeps the first one and its opening time');
  assert.equal(again.opensAt, a.opensAt);
  assert.deepEqual((await store.listAddresses(WALLET)).map((s) => s.id), [a.id]);

  assert.equal(await store.removeAddress('0x00000000000000000000000000000000000000ff', a.id, 6_000), false, 'another wallet cannot remove it');
  assert.equal(await store.removeAddress(WALLET, a.id, 6_000), true);
  assert.deepEqual(await store.listAddresses(WALLET), []);
  const b = await store.addAddress(WALLET, 'arc', DEST, 7_000);
  assert.notEqual(b.id, a.id);
  assert.equal(b.opensAt, 7_000 + ADDRESS_WAIT_MS, 'a removed address waits again');

  const sol = await store.addAddress(WALLET, 'solana', '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 7_000);
  assert.equal(sol.address, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'a Solana address keeps its case');
  await store.removeAddress(WALLET, sol.id, 7_001);

  assert.deepEqual(await store.state(WALLET), { pausedAt: null, returnCheckDueAt: null });
  await store.setPaused(WALLET, 10);
  await store.setReturnCheckDue(WALLET, 20);
  assert.deepEqual(await store.state(WALLET), { pausedAt: 10, returnCheckDueAt: 20 });
  await store.setPaused(WALLET, null);
  assert.deepEqual(await store.state(WALLET), { pausedAt: null, returnCheckDueAt: 20 });

  await store.withAccountLock(WALLET, async (spend) => {
    await spend.reserve('ref-1', usdc(100), 100);
    await spend.reserve('ref-1', usdc(100), 100);
    await spend.reserve('ref-2', usdc(50), 200);
  });
  const spent = await store.withAccountLock(WALLET, (spend) => spend.spentSince(150));
  assert.deepEqual(spent, [{ amountMicros: usdc(50), at: 200 }]);
  const all = await store.withAccountLock(WALLET, (spend) => spend.spentSince(0));
  assert.equal(all.reduce((s, x) => s + x.amountMicros, 0n), usdc(150), 'a repeated reference counts once');
  assert.equal(await store.withAccountLock(WALLET, (spend) => spend.reserved('ref-1')), true);
  assert.equal(await store.withAccountLock(WALLET, (spend) => spend.reserved('ref-9')), false);
  assert.equal(
    await store.withAccountLock('0x00000000000000000000000000000000000000ff', (spend) => spend.reserved('ref-1')),
    false,
    "another account's reference is not this account's payment",
  );
  await store.release('ref-2');
  const left = await store.withAccountLock(WALLET, (spend) => spend.spentSince(0));
  assert.deepEqual(left, [{ amountMicros: usdc(100), at: 100 }]);

  // Two payments at once against the limit: exactly one gets through.
  const attempt = (reference: string) =>
    store.withAccountLock(WALLET, async (spend) => {
      const total = (await spend.spentSince(0)).reduce((s, x) => s + x.amountMicros, 0n);
      await new Promise((r) => setTimeout(r, 50));
      if (total + usdc(300) > DAILY_LIMIT_MICROS) return false;
      await spend.reserve(reference, usdc(300), 300);
      return true;
    });
  const results = await Promise.all([attempt('race-1'), attempt('race-2')]);
  assert.deepEqual(results.filter(Boolean).length, 1);
}

test('the money-out store on Postgres', { skip: !url }, () => withSchema(contract));

test('the in-memory money-out store behaves the same', () => contract(createMemoryMoneyOutStore()));
