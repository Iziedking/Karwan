import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryResearchAllowanceStore } from './researchAllowance.js';
import { deliverComplimentaryResearchReport, ResearchDeliveryInProgressError } from './researchReportDelivery.js';

const HUMAN = 'a'.repeat(64);
const AGENT = '0x1111111111111111111111111111111111111111';

async function readyStore() {
  const store = new InMemoryResearchAllowanceStore();
  await store.verifyBinding({ humanKeyDigest: HUMAN, agentAddress: AGENT, verifier: 'world-agentbook', checkedAt: 1_000, expiresAt: 100_000, domain: 'karwan.research', nonce: 'verify', nonceExpiresAt: 10_000, now: 1_000 });
  return store;
}

test('provider failure releases the report reservation', async () => {
  const store = await readyStore();
  await assert.rejects(
    () => deliverComplimentaryResearchReport({ store, agentAddress: AGENT, requestId: 'request-1', resourceId: 'deal:one:seller', now: () => 2_000, deliver: async () => { throw new Error('provider unavailable'); } }),
    /provider unavailable/,
  );
  assert.equal((await store.get({ humanKeyDigest: HUMAN, now: 2_000 }))?.remaining, 3);
});

test('successful delivery is persisted and duplicate retries reuse it', async () => {
  const store = await readyStore();
  let deliveries = 0;
  const deliver = async () => { deliveries += 1; return { subject: '0xabc', rows: [{ outcome: 'clean' }] }; };
  const first = await deliverComplimentaryResearchReport({ store, agentAddress: AGENT, requestId: 'request-1', resourceId: 'deal:one:seller', now: () => 2_000, deliver });
  const retry = await deliverComplimentaryResearchReport({ store, agentAddress: AGENT, requestId: 'request-2', resourceId: 'deal:one:seller', now: () => 2_100, deliver });
  assert.equal(deliveries, 1);
  assert.equal(first.reused, false);
  assert.equal(retry.reused, true);
  assert.deepEqual(retry.result, first.result);
  assert.equal(retry.resultId, first.resultId);
  assert.equal(retry.allowance.used, 1);
});

test('a concurrent retry does not execute a second delivery', async () => {
  const store = await readyStore();
  await store.reserve({ agentAddress: AGENT, requestId: 'request-1', resourceId: 'deal:one:seller', now: 2_000 });
  let deliveries = 0;
  await assert.rejects(
    () => deliverComplimentaryResearchReport({ store, agentAddress: AGENT, requestId: 'request-2', resourceId: 'deal:one:seller', now: () => 2_100, deliver: async () => { deliveries += 1; return {}; } }),
    ResearchDeliveryInProgressError,
  );
  assert.equal(deliveries, 0);
});
