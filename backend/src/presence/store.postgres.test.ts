import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { NUMBERED_MIGRATIONS, type SqlExecutor } from '../db/migrations.js';
import { presenceAction } from './action.js';
import { GRANT_WINDOW_MS, createMemoryPresenceStore, createPostgresPresenceStore, type PresenceChallenge, type PresenceStore } from './store.js';

const url = process.env.TEST_DATABASE_URL;
const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';

function challenge(over: Partial<PresenceChallenge> = {}): PresenceChallenge {
  return {
    id: 'c1',
    wallet: A,
    digest: '0xd1',
    action: presenceAction({ kind: 'move_out', wallet: A, amountMicros: '5000000', recipient: B }),
    webauthnChallenge: 'w1',
    createdAt: 0,
    expiresAt: 300_000,
    confirmedAt: null,
    method: null,
    usedAt: null,
    ...over,
  };
}

async function presenceStoreContract(store: PresenceStore) {
  // a_confirmed_challenge_is_consumed_once_for_its_wallet_and_digest
  await store.createChallenge(challenge());
  assert.equal((await store.challenge('c1'))?.action.amountMicros, '5000000');
  assert.equal(await store.consume('c1', A, '0xd1', 1), 'missing', 'not confirmed yet');
  assert.equal(await store.consume('nope', A, '0xd1', 1), 'missing');
  assert.equal(await store.confirm('c1', 'pin', 10), true);
  assert.equal(await store.confirm('c1', 'pin', 11), false, 'confirmed once');
  assert.equal(await store.consume('c1', B, '0xd1', 20), 'mismatch');
  assert.equal(await store.consume('c1', A, '0xd2', 20), 'mismatch');
  assert.equal(await store.consume('c1', A, '0xd1', 20), 'ok');
  assert.equal(await store.consume('c1', A, '0xd1', 21), 'used');
  assert.equal((await store.challenge('c1'))?.method, 'pin');

  // a_grant_expires_two_minutes_after_confirmation
  await store.createChallenge(challenge({ id: 'c2' }));
  await store.confirm('c2', 'passkey', 1_000);
  assert.equal(await store.consume('c2', A, '0xd1', 1_000 + GRANT_WINDOW_MS + 1), 'expired');
  await store.createChallenge(challenge({ id: 'c2b' }));
  await store.confirm('c2b', 'passkey', 1_000);
  assert.equal(await store.consume('c2b', A, '0xd1', 1_000 + GRANT_WINDOW_MS), 'ok');

  // two_concurrent_consumes_give_one_ok
  await store.createChallenge(challenge({ id: 'c3' }));
  await store.confirm('c3', 'wallet', 5);
  const both = await Promise.all([store.consume('c3', A, '0xd1', 6), store.consume('c3', A, '0xd1', 6)]);
  assert.deepEqual(both.sort(), ['ok', 'used']);

  // an_expired_challenge_cannot_be_confirmed
  await store.createChallenge(challenge({ id: 'c4', expiresAt: 100 }));
  assert.equal(await store.confirm('c4', 'pin', 101), false);
  assert.equal(await store.consume('c4', A, '0xd1', 102), 'missing');

  // expired_challenges_are_cleaned_out_once_no_grant_can_use_them
  await store.createChallenge(challenge({ id: 'old', expiresAt: 1_000 }));
  await store.createChallenge(challenge({ id: 'young', expiresAt: 1_000 + GRANT_WINDOW_MS }));
  assert.equal(await store.purgeExpired(1_000 + GRANT_WINDOW_MS + 1), 2, 'this one and c4 from above');
  assert.equal(await store.challenge('old'), null);
  assert.equal(await store.challenge('c4'), null);
  assert.ok(await store.challenge('young'), 'a challenge whose grant could still be spent stays');

  // PINs and passkeys
  assert.equal(await store.pin(A), null);
  await store.savePin(A, { hash: 'h1', failures: 2, lockedUntil: 900 });
  assert.deepEqual(await store.pin(A.toUpperCase().replace('0X', '0x')), { hash: 'h1', failures: 2, lockedUntil: 900 });
  await store.savePin(A, { hash: 'h2', failures: 0, lockedUntil: null });
  assert.deepEqual(await store.pin(A), { hash: 'h2', failures: 0, lockedUntil: null });

  await store.addPasskey({ credentialId: 'k1', wallet: A, publicKey: 'pk', counter: 0, transports: ['internal'], createdAt: 1 });
  await store.addPasskey({ credentialId: 'k2', wallet: B, publicKey: 'pk', counter: 0, transports: [], createdAt: 1 });
  assert.deepEqual((await store.passkeys(A)).map((p) => p.credentialId), ['k1']);
  await store.bumpPasskey('k1', 7);
  assert.equal((await store.passkeys(A))[0]?.counter, 7);
  assert.deepEqual((await store.passkeys(A))[0]?.transports, ['internal']);
  assert.equal(await store.removePasskey(B, 'k1'), false, 'another wallet cannot remove it');
  assert.equal(await store.removePasskey(A, 'k1'), true);
  assert.deepEqual(await store.passkeys(A), []);

  // withPinLock runs one PIN check at a time per wallet
  const order: string[] = [];
  await Promise.all([
    store.withPinLock(A, async () => { order.push('a1'); await new Promise((r) => setTimeout(r, 30)); order.push('a2'); }),
    store.withPinLock(A, async () => { order.push('b1'); order.push('b2'); }),
  ]);
  assert.deepEqual(order.join(','), order[0] === 'a1' ? 'a1,a2,b1,b2' : 'b1,b2,a1,a2');

  // forgetting one account leaves another alone
  await store.savePin(B, { hash: 'hb', failures: 0, lockedUntil: null });
  await store.addPasskey({ credentialId: 'k3', wallet: A, publicKey: 'pk', counter: 0, transports: [], createdAt: 1 });
  await store.forget(A);
  assert.equal(await store.pin(A), null);
  assert.deepEqual(await store.passkeys(A), []);
  assert.equal(await store.challenge('c1'), null);
  assert.equal((await store.pin(B))?.hash, 'hb');
  assert.equal((await store.passkeys(B)).length, 1);
}


test('the presence store on Postgres', { skip: !url }, async () => {
  const schema = `confirm_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^confirm_[a-f0-9]{32}$/);
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
    await pool.query(NUMBERED_MIGRATIONS.find((m) => m.name === 'confirm_presence')!.sql);
    await presenceStoreContract(createPostgresPresenceStore(transaction));
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test('the in-memory presence store behaves the same', () => presenceStoreContract(createMemoryPresenceStore()));
