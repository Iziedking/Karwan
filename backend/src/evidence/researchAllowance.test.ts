import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryResearchAllowanceStore,
  ResearchAllowanceExhaustedError,
  ResearchAllowanceReplayError,
} from './researchAllowance.js';

const HUMAN = 'a'.repeat(64);
const AGENT_A = '0x1111111111111111111111111111111111111111';
const AGENT_B = '0x2222222222222222222222222222222222222222';

test('two verified agents consume one human allowance', async () => {
  const store = new InMemoryResearchAllowanceStore();
  const first = await store.consume({ humanKeyDigest: HUMAN, agentAddress: AGENT_A, domain: 'karwan.research', nonce: 'a-1', nonceExpiresAt: 10_000, now: 1_000 });
  const second = await store.consume({ humanKeyDigest: HUMAN, agentAddress: AGENT_B, domain: 'karwan.research', nonce: 'b-1', nonceExpiresAt: 10_000, now: 1_001 });
  assert.equal(first.snapshot.remaining, 2);
  assert.equal(second.snapshot.used, 2);
  assert.equal((await store.get({ humanKeyDigest: HUMAN, now: 1_001 }))?.used, 2);
});

test('nonce replay is refused without consuming another report', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await store.consume({ humanKeyDigest: HUMAN, agentAddress: AGENT_A, domain: 'karwan.research', nonce: 'replay', nonceExpiresAt: 10_000, now: 1_000 });
  await assert.rejects(
    () => store.consume({ humanKeyDigest: HUMAN, agentAddress: AGENT_A, domain: 'karwan.research', nonce: 'replay', nonceExpiresAt: 10_000, now: 1_001 }),
    ResearchAllowanceReplayError,
  );
  assert.equal((await store.get({ humanKeyDigest: HUMAN, now: 1_001 }))?.used, 1);
});

test('allowance exhaustion and provider outage preserve the ledger', async () => {
  const store = new InMemoryResearchAllowanceStore();
  for (let i = 0; i < 3; i += 1) {
    await store.consume({ humanKeyDigest: HUMAN, agentAddress: i % 2 === 0 ? AGENT_A : AGENT_B, domain: 'karwan.research', nonce: `n-${i}`, nonceExpiresAt: 10_000, now: 1_000 + i });
  }
  await assert.rejects(
    () => store.consume({ humanKeyDigest: HUMAN, agentAddress: AGENT_B, domain: 'karwan.research', nonce: 'n-4', nonceExpiresAt: 10_000, now: 1_004 }),
    ResearchAllowanceExhaustedError,
  );
  assert.equal((await store.get({ humanKeyDigest: HUMAN, now: 1_004 }))?.used, 3);
});

test('a new UTC period starts a fresh allowance without deleting history', async () => {
  const store = new InMemoryResearchAllowanceStore();
  await store.consume({ humanKeyDigest: HUMAN, agentAddress: AGENT_A, domain: 'karwan.research', nonce: 'day-1', nonceExpiresAt: 90_000_000, now: 86_399_000 });
  const next = await store.consume({ humanKeyDigest: HUMAN, agentAddress: AGENT_B, domain: 'karwan.research', nonce: 'day-2', nonceExpiresAt: 90_000_000, now: 86_400_000 });
  assert.equal(next.snapshot.used, 1);
  assert.equal(next.snapshot.remaining, 2);
});
