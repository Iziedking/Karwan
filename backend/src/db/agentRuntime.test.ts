import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryAgentRuntimeRepository,
  OptimisticConcurrencyError,
  RuntimeDuplicateError,
} from './agentRuntime.js';

function repository() {
  return new InMemoryAgentRuntimeRepository();
}

test('repository enforces natural uniqueness boundaries', async () => {
  const repo = repository();
  await repo.createDealRoom({ id: 'room-1', jobId: 'job-1', data: {}, now: 1 });
  await assert.rejects(
    () => repo.createDealRoom({ id: 'room-2', jobId: 'job-1', data: {}, now: 2 }),
    RuntimeDuplicateError,
  );

  await repo.createOffer({ id: 'offer-1', dealRoomId: 'room-1', offerVersion: 1, proposer: 'buyer', data: {}, now: 2 });
  await assert.rejects(
    () => repo.createOffer({ id: 'offer-2', dealRoomId: 'room-1', offerVersion: 1, proposer: 'seller', data: {}, now: 3 }),
    RuntimeDuplicateError,
  );

  await repo.createTask({ id: 'task-1', kind: 'qualify', idempotencyKey: 'qualify:room-1:v1', availableAt: 3, data: {}, now: 3 });
  await assert.rejects(
    () => repo.createTask({ id: 'task-2', kind: 'qualify', idempotencyKey: 'qualify:room-1:v1', availableAt: 4, data: {}, now: 4 }),
    RuntimeDuplicateError,
  );

  await repo.createApproval({ id: 'approval-1', dealRoomId: 'room-1', requestKey: 'stake:room-1:v1', kind: 'stake', data: {}, now: 4 });
  await assert.rejects(
    () => repo.createApproval({ id: 'approval-2', dealRoomId: 'room-1', requestKey: 'stake:room-1:v1', kind: 'stake', data: {}, now: 5 }),
    RuntimeDuplicateError,
  );
});

test('exactly one concurrent update wins from one DealRoom version', async () => {
  const repo = repository();
  const room = await repo.createDealRoom({ id: 'room-1', jobId: 'job-1', data: {}, now: 1 });
  const outcomes = await Promise.allSettled([
    repo.updateDealRoom(room.id, room.version, 'qualifying', { worker: 'a' }, 2),
    repo.updateDealRoom(room.id, room.version, 'negotiating', { worker: 'b' }, 2),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(rejected.reason instanceof OptimisticConcurrencyError);
  assert.equal((await repo.getDealRoom(room.id))?.version, 2);
});

test('repositories use the pure transition guards and retain immutable identity', async () => {
  const repo = repository();
  await repo.createDealRoom({ id: 'room-1', jobId: 'job-1', data: {}, now: 1 });

  const offer = await repo.createOffer({ id: 'offer-1', dealRoomId: 'room-1', offerVersion: 1, proposer: 'buyer', data: { amountMicros: '1000000' }, now: 2 });
  const proposed = await repo.updateOffer(offer.id, offer.version, 'proposed', { note: 'review' }, 3);
  assert.equal(proposed.id, offer.id);
  assert.equal(proposed.offerVersion, 1);
  assert.deepEqual(proposed.data, { amountMicros: '1000000', note: 'review' });
  await assert.rejects(() => repo.updateOffer(proposed.id, proposed.version, 'draft'), /invalid offer transition/);
  const annotated = await repo.updateOffer(proposed.id, proposed.version, 'proposed', { source: 'policy' }, 4);
  assert.equal(annotated.version, 3);
  assert.equal(annotated.updatedAt, 4);
  assert.deepEqual(annotated.data, {
    amountMicros: '1000000',
    note: 'review',
    source: 'policy',
  });

  const task = await repo.createTask({ id: 'task-1', dealRoomId: 'room-1', kind: 'negotiate', idempotencyKey: 'negotiate:room-1:v1', availableAt: 4, data: {}, now: 4 });
  const leased = await repo.updateTask(task.id, task.version, 'leased', undefined, 5);
  assert.equal(leased.version, 2);
  await assert.rejects(() => repo.updateTask(leased.id, leased.version, 'succeeded'), /invalid agent task transition/);

  const approval = await repo.createApproval({ id: 'approval-1', dealRoomId: 'room-1', requestKey: 'match:room-1:v1', kind: 'match', data: {}, now: 6 });
  const approved = await repo.updateApproval(approval.id, approval.version, 'approved', undefined, 7);
  const executed = await repo.updateApproval(approved.id, approved.version, 'executed', undefined, 8);
  assert.equal(executed.state, 'executed');
  await assert.rejects(() => repo.updateApproval(executed.id, executed.version, 'requested'), /invalid approval transition/);
});
