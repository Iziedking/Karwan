import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryResearchAllowanceStore,
  ResearchAllowanceConflictError,
  ResearchAllowanceExhaustedError,
  ResearchAllowanceReplayError,
} from './researchAllowance.js';

const HUMAN = 'a'.repeat(64);
const AGENT_A = '0x1111111111111111111111111111111111111111';
const AGENT_B = '0x2222222222222222222222222222222222222222';

async function verify(store: InMemoryResearchAllowanceStore, agentAddress: string, nonce: string, now = 1_000) {
  return store.verifyBinding({
    humanKeyDigest: HUMAN,
    agentAddress,
    verifier: 'world-agentbook',
    checkedAt: now,
    expiresAt: 100_000_000,
    domain: 'karwan.research',
    nonce,
    nonceExpiresAt: 10_000,
    now,
  });
}

test('verification records identity and nonce without consuming a report', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await verify(store, AGENT_A, 'verify-a');
  assert.equal(await store.get({ humanKeyDigest: HUMAN, now: 1_000 }), null);
  assert.equal((await store.getBinding(AGENT_A))?.humanKeyDigest, HUMAN);
  await assert.rejects(() => verify(store, AGENT_A, 'verify-a', 1_001), ResearchAllowanceReplayError);
  assert.equal(await store.get({ humanKeyDigest: HUMAN, now: 1_001 }), null);
});

test('a report is counted only after successful delivery', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await verify(store, AGENT_A, 'verify-a');
  const reserved = await store.reserve({ agentAddress: AGENT_A, requestId: 'request-1', resourceId: 'deal:one:seller', now: 2_000 });
  assert.equal(reserved.snapshot.used, 0);
  assert.equal(reserved.snapshot.reserved, 1);
  assert.equal(reserved.snapshot.remaining, 2);
  const delivered = await store.commit({ reservationId: reserved.reservation.id, attemptToken: reserved.reservation.attemptToken, resultId: 'report-sha-1', now: 2_100 });
  assert.equal(delivered.snapshot.used, 1);
  assert.equal(delivered.snapshot.reserved, 0);
  assert.equal(delivered.snapshot.remaining, 2);
});

test('failed delivery releases its reservation without spending allowance', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await verify(store, AGENT_A, 'verify-a');
  const reserved = await store.reserve({ agentAddress: AGENT_A, requestId: 'request-failed', resourceId: 'deal:failed:seller', now: 2_000 });
  const released = await store.release({ reservationId: reserved.reservation.id, attemptToken: reserved.reservation.attemptToken, reason: 'provider unavailable', now: 2_100 });
  assert.equal(released.reservation.state, 'released');
  assert.equal(released.snapshot.used, 0);
  assert.equal(released.snapshot.reserved, 0);
  assert.equal(released.snapshot.remaining, 3);
});

test('delivery retry and a second agent cannot double-consume one report', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await verify(store, AGENT_A, 'verify-a');
  await verify(store, AGENT_B, 'verify-b');
  const first = await store.reserve({ agentAddress: AGENT_A, requestId: 'request-1', resourceId: 'deal:shared:seller', now: 2_000 });
  const delivered = await store.commit({ reservationId: first.reservation.id, attemptToken: first.reservation.attemptToken, resultId: 'report-sha-1', now: 2_100 });
  const retry = await store.reserve({ agentAddress: AGENT_B, requestId: 'request-2', resourceId: 'deal:shared:seller', now: 2_200 });
  const committedAgain = await store.commit({ reservationId: retry.reservation.id, attemptToken: retry.reservation.attemptToken, resultId: 'report-sha-1', now: 2_300 });
  assert.equal(retry.created, false);
  assert.equal(retry.reservation.state, 'delivered');
  assert.equal(delivered.snapshot.used, 1);
  assert.equal(committedAgain.snapshot.used, 1);
  assert.deepEqual((await store.getDelivered({ agentAddress: AGENT_B, resourceId: 'deal:shared:seller' }))?.resultId, 'report-sha-1');
});

test('two verified agents share one human cap across distinct reports', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await verify(store, AGENT_A, 'verify-a');
  await verify(store, AGENT_B, 'verify-b');
  for (const [index, agentAddress] of [AGENT_A, AGENT_B, AGENT_A].entries()) {
    const reserved = await store.reserve({ agentAddress, requestId: `request-${index}`, resourceId: `deal:${index}:counterparty`, now: 2_000 + index });
    await store.commit({ reservationId: reserved.reservation.id, attemptToken: reserved.reservation.attemptToken, resultId: `report-${index}`, now: 3_000 + index });
  }
  await assert.rejects(
    () => store.reserve({ agentAddress: AGENT_B, requestId: 'request-4', resourceId: 'deal:4:counterparty', now: 4_000 }),
    ResearchAllowanceExhaustedError,
  );
  assert.equal((await store.get({ humanKeyDigest: HUMAN, now: 4_000 }))?.used, 3);
});

test('a new UTC period starts a fresh allowance without deleting history', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await verify(store, AGENT_A, 'verify-a');
  const first = await store.reserve({ agentAddress: AGENT_A, requestId: 'day-1', resourceId: 'deal:day-1', now: 86_399_000 });
  await store.commit({ reservationId: first.reservation.id, attemptToken: first.reservation.attemptToken, resultId: 'report-day-1', now: 86_399_500 });
  const next = await store.reserve({ agentAddress: AGENT_A, requestId: 'day-2', resourceId: 'deal:day-2', now: 86_400_000 });
  assert.equal(next.snapshot.used, 0);
  assert.equal(next.snapshot.reserved, 1);
  assert.equal(next.snapshot.remaining, 2);
});

test('an expired worker cannot release or commit its replacement attempt', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await verify(store, AGENT_A, 'verify-a');
  const first = await store.reserve({ agentAddress: AGENT_A, requestId: 'request-expired', resourceId: 'deal:expired:seller', now: 2_000, leaseMs: 1_000 });
  const replacement = await store.reserve({ agentAddress: AGENT_A, requestId: 'request-replacement', resourceId: 'deal:expired:seller', now: 3_001 });
  assert.equal(replacement.created, true);
  assert.notEqual(replacement.reservation.attemptToken, first.reservation.attemptToken);
  await assert.rejects(
    () => store.release({ reservationId: first.reservation.id, attemptToken: first.reservation.attemptToken, reason: 'stale worker', now: 3_002 }),
    ResearchAllowanceConflictError,
  );
  await assert.rejects(
    () => store.commit({ reservationId: first.reservation.id, attemptToken: first.reservation.attemptToken, resultId: 'stale-result', now: 3_002 }),
    ResearchAllowanceConflictError,
  );
  const committed = await store.commit({ reservationId: replacement.reservation.id, attemptToken: replacement.reservation.attemptToken, resultId: 'replacement-result', now: 3_003 });
  assert.equal(committed.reservation.state, 'delivered');
});
