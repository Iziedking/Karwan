import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAgentRuntimeRepository, RuntimeDuplicateError } from '../db/agentRuntime.js';
import { ensureShadowDealRoom } from './shadowDealRoom.js';

test('shadow deal room creation is additive and idempotent', async () => {
  const repository = new InMemoryAgentRuntimeRepository();
  const first = await ensureShadowDealRoom(repository, 'job-shadow-1', 100);
  const second = await ensureShadowDealRoom(repository, 'job-shadow-1', 200);

  assert.equal(first.id, 'job-shadow-1');
  assert.equal(first.jobId, 'job-shadow-1');
  assert.equal(first.state, 'open');
  assert.equal(first.version, 1);
  assert.deepEqual(first.data, {
    mode: 'read-only-shadow',
    authoritativeDealRoom: 'legacy',
  });
  assert.deepEqual(second, first);
});

test('a failed insert is not hidden when no concurrent room exists', async () => {
  const repository = new InMemoryAgentRuntimeRepository();
  const original = repository.createDealRoom.bind(repository);
  repository.createDealRoom = async () => {
    throw new RuntimeDuplicateError('unrelated duplicate');
  };

  await assert.rejects(
    ensureShadowDealRoom(repository, 'job-shadow-2', 100),
    /unrelated duplicate/,
  );
  repository.createDealRoom = original;
});

test('blank shadow room ids fail before any repository write', async () => {
  const repository = new InMemoryAgentRuntimeRepository();
  await assert.rejects(ensureShadowDealRoom(repository, '   ', 100), /id is required/);
});
