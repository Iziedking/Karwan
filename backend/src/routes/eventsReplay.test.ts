import assert from 'node:assert/strict';
import test from 'node:test';
import type { DealRoomStreamRecord, DomainEventV2 } from '../events/domainEventStore.js';
import {
  buildDealRoomReplayEnvelope,
  buildJobReplayEnvelope,
  type DurableReplayStore,
  type ReplayProjectionContext,
} from './events.js';

const caller = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function room(): DealRoomStreamRecord {
  return {
    id: 'room-1',
    jobId: 'job-1',
    state: 'qualifying',
    version: 4,
    lastSequence: 4,
    createdAt: 100,
    updatedAt: 400,
    data: {},
  };
}

function event(sequence: number, payload: Record<string, unknown> = {}): DomainEventV2 {
  return {
    id: `event-${sequence}`,
    aggregateType: 'deal_room',
    aggregateId: 'room-1',
    aggregateVersion: sequence,
    sequence,
    category: 'deal_room',
    type: 'deal.room.state.changed',
    actor: 'platform',
    jobId: 'job-1',
    payload,
    occurredAt: sequence * 100,
  };
}

function context(overrides: Partial<ReplayProjectionContext> = {}): ReplayProjectionContext {
  return {
    caller,
    callerJobs: new Set(['job-1']),
    buyerJobs: new Set(['job-1']),
    callerBridges: new Set(),
    ...overrides,
  };
}

function storeFor(
  currentRoom: DealRoomStreamRecord | null = room(),
  events: DomainEventV2[] = [event(1), event(2), event(3), event(4)],
): DurableReplayStore {
  return {
    async getDealRoom(id) {
      return currentRoom?.id === id ? currentRoom : null;
    },
    async findDealRoomByJobId(jobId) {
      return currentRoom?.jobId === jobId ? currentRoom : null;
    },
    async listAfterSequence(_dealRoomId, afterSequence) {
      return events.filter((item) => item.sequence > afterSequence);
    },
  };
}

test('room replay returns the durable cursor and ordered events after the browser cursor', async () => {
  const replay = await buildDealRoomReplayEnvelope(storeFor(), 'room-1', 2, context());

  assert.ok(replay);
  assert.equal(replay.dealRoomId, 'room-1');
  assert.equal(replay.afterSequence, 2);
  assert.equal(replay.currentSequence, 4);
  assert.deepEqual(replay.events.map((item) => item.sequence), [3, 4]);
  assert.deepEqual(replay.events.map((item) => item.eventId), ['event-3', 'event-4']);
});

test('job replay projects full detail for a party and hides it from an unauthorized caller', async () => {
  const events = [event(3, { buyer: caller, state: 'qualified' })];
  const partyReplay = await buildJobReplayEnvelope(storeFor(room(), events), 'job-1', 2, context());
  assert.equal(partyReplay.dealRoomId, 'room-1');
  assert.equal(partyReplay.events[0]?.jobId, 'job-1');
  assert.deepEqual(partyReplay.events[0]?.payload, { buyer: caller, state: 'qualified' });

  const strangerReplay = await buildJobReplayEnvelope(
    storeFor(room(), events),
    'job-1',
    2,
    context({ caller: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', callerJobs: new Set() }),
  );
  assert.deepEqual(strangerReplay, {
    dealRoomId: null,
    afterSequence: 2,
    currentSequence: 2,
    events: [],
  });
});

test('replay collapses missing rooms and clamps malformed cursors without probing storage', async () => {
  let listed = false;
  const missing: DurableReplayStore = {
    async getDealRoom() {
      return null;
    },
    async findDealRoomByJobId() {
      return null;
    },
    async listAfterSequence() {
      listed = true;
      return [];
    },
  };

  assert.equal(await buildDealRoomReplayEnvelope(missing, 'missing', -20.5, context()), null);
  assert.deepEqual(await buildJobReplayEnvelope(missing, 'missing', Number.NaN, context()), {
    dealRoomId: null,
    afterSequence: 0,
    currentSequence: 0,
    events: [],
  });
  assert.equal(listed, false);
});
