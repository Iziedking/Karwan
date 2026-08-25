import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryNegotiationAttemptStore, NegotiationAttemptConflict } from './attempts.js';

test('attempt store deduplicates a trigger and fences updates by version', async () => {
  const store = new InMemoryNegotiationAttemptStore();
  const input = { id: 'attempt-1', dealRoomId: 'room-1', attemptNumber: 1, trigger: 'INITIAL_MATCH' as const, triggerReference: 'match-1', strategy: { objective: 'meet scope' }, now: 100 };
  const first = await store.create(input);
  const duplicate = await store.create({ ...input, id: 'attempt-duplicate', now: 200 });
  assert.equal(duplicate.id, first.id);
  const running = await store.update(first.id, 1, 'running', undefined, 200);
  assert.equal(running.version, 2);
  await assert.rejects(() => store.update(first.id, 1, 'waiting'), NegotiationAttemptConflict);
  await assert.rejects(() => store.update(first.id, 2, 'planned'), NegotiationAttemptConflict);
});

test('temporary impasse is non-retryable within the same attempt', async () => {
  const store = new InMemoryNegotiationAttemptStore();
  const attempt = await store.create({ id: 'attempt-1', dealRoomId: 'room-1', attemptNumber: 1, trigger: 'INITIAL_MATCH', triggerReference: 'match-1', strategy: {}, now: 100 });
  const impasse = await store.update(attempt.id, 1, 'temporary_impasse', undefined, 200);
  assert.equal(impasse.state, 'temporary_impasse');
  await assert.rejects(() => store.update(attempt.id, 2, 'running'), /invalid negotiation attempt transition/);
});
