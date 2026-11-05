import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import type { AgentJob, AgentJobsStore } from './agentJobs.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const job = (ref: string, over: Partial<AgentJob> = {}): AgentJob => ({
  ref, humanKeyDigest: 'h1', agentAddress: '0x1111111111111111111111111111111111111111', sellerAccount: '0xAbCd000000000000000000000000000000000001',
  sellerTag: 'ada', provider: '0x2222222222222222222222222222222222222222', work: 'Logo', amountMicros: '50000000', feeBps: 100,
  expiredAt: Date.now() + 86_400_000, status: 'quoted', tx: {}, createdAt: Date.now(), updatedAt: Date.now(), ...over,
});

async function checks(store: AgentJobsStore) {
  const now = Date.now();
  assert.equal(await store.savePairing({ humanKeyDigest: 'h1', worldSessionId: 'session_1', agentAddress: '0xa', pairedAt: now }), true);
  assert.equal(await store.savePairing({ humanKeyDigest: 'h1', worldSessionId: 'session_1', agentAddress: '0xb', pairedAt: now }), true, 'the same human pairs another agent');
  assert.equal(await store.savePairing({ humanKeyDigest: 'h2', worldSessionId: 'session_1', agentAddress: '0xc', pairedAt: now }), false, 'one World ID, one human key');
  assert.equal(await store.savePairing({ humanKeyDigest: 'h1', worldSessionId: 'session_9', agentAddress: '0xd', pairedAt: now }), false, 'a paired human key keeps its World ID');
  assert.equal((await store.pairingBySession('session_1'))?.agentAddress, '0xb');

  await store.createJob(job('j1'));
  assert.equal(await store.patchJob('j1', { status: 'funded' }, ['created']), null, 'a stale status never moves');
  const funded = await store.patchJob('j1', { status: 'funded', chainId: '7', tx: { fund: '0xf' } }, ['quoted']);
  assert.equal(funded?.status, 'funded');
  const submitted = await store.patchJob('j1', { status: 'submitted', tx: { submit: '0x5' } });
  assert.deepEqual(submitted?.tx, { fund: '0xf', submit: '0x5' }, 'tx hashes add up');
  assert.equal((await store.jobsForSeller('0xabcd000000000000000000000000000000000001')).length, 1);
  assert.deepEqual((await store.jobsWithStatus(['submitted'])).map((j) => j.ref), ['j1']);

  await store.putToken({ hash: 't1', kind: 'release', subject: 'j1', agentAddress: '0xa', expiresAt: now + 60_000 });
  await store.putToken({ hash: 't2', kind: 'release', subject: 'j1', agentAddress: '0xa', expiresAt: now - 1 });
  assert.equal(await store.takeToken('t1', 'pair', now), null, 'the kind must match');
  assert.ok(await store.peekToken('t1', 'release', now));
  assert.ok(await store.takeToken('t1', 'release', now));
  assert.equal(await store.takeToken('t1', 'release', now), null, 'a link works once');
  assert.equal(await store.takeToken('t2', 'release', now), null, 'an expired link does not work');
}

test('Postgres agent jobs store keeps pairings, jobs and one-time links', { skip: !testDatabaseUrl }, async () => {
  const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
  const schema = `karwan_agentjobs_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const scoped = new URL(testDatabaseUrl!);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = scoped.toString();
  const client = await import('./client.js');
  try {
    await client.ensureSchema();
    await checks((await import('./agentJobs.js')).postgresAgentJobsStore());
  } finally {
    await client.closePostgresPool();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});

// After the Postgres run: importing the store first would load the database
// client before the scoped URL is set.
test('memory agent jobs store keeps pairings, jobs and one-time links', async () => {
  await checks((await import('./agentJobs.js')).memoryAgentJobsStore());
});
