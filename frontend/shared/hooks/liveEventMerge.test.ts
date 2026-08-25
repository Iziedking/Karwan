import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChainEvent } from '@/core/api';
import { collectReplayPages, mergeLiveEvents } from './useLiveEvents';

function event(input: Partial<ChainEvent> & Pick<ChainEvent, 'type' | 'ts'>): ChainEvent {
  return {
    actor: 'platform',
    payload: {},
    ...input,
  };
}

test('duplicate event IDs merge to one client event', () => {
  const live = event({
    eventId: 'event-239',
    dealRoomId: 'room-1',
    sequence: 239,
    type: 'deal.room.state.changed',
    ts: 2,
    jobId: 'job-1',
    payload: { state: 'qualified' },
  });
  assert.deepEqual(mergeLiveEvents([live], [live]), [live]);
});

test('replay from 238 merges 239 through current in descending UI order', () => {
  const existing = event({ eventId: 'event-238', dealRoomId: 'room-1', sequence: 238, type: 'deal.room.state.changed', ts: 238 });
  const missing = [239, 240, 241].map((sequence) =>
    event({ eventId: `event-${sequence}`, dealRoomId: 'room-1', sequence, type: 'deal.room.state.changed', ts: sequence }),
  );
  assert.deepEqual(
    mergeLiveEvents([existing], missing).map((item) => item.sequence),
    [241, 240, 239, 238],
  );
});

test('full projected detail wins over a duplicate privacy pulse', () => {
  const pulse = event({ eventId: 'event-1', type: 'deal.room.state.changed', ts: 1 });
  const detail = event({
    eventId: 'event-1',
    type: 'deal.room.state.changed',
    ts: 1,
    jobId: 'job-1',
    payload: { state: 'qualifying' },
  });
  assert.deepEqual(mergeLiveEvents([pulse], [detail]), [detail]);
  assert.deepEqual(mergeLiveEvents([detail], [pulse]), [detail]);
});

test('legacy events without IDs retain the existing durable identity fallback', () => {
  const legacy = event({ type: 'bid.submitted', jobId: 'job-1', ts: 100, payload: { priceUsdc: '10' } });
  assert.equal(mergeLiveEvents([legacy], [legacy]).length, 1);
});

test('large reconnect gaps request ordered pages until the server cursor is reached', async () => {
  const requested: number[] = [];
  const missing = await collectReplayPages(238, async (cursor) => {
    requested.push(cursor);
    if (cursor === 238) {
      return {
        currentSequence: 740,
        events: Array.from({ length: 500 }, (_, index) =>
          event({
            eventId: `event-${239 + index}`,
            dealRoomId: 'room-1',
            sequence: 239 + index,
            type: 'deal.room.state.changed',
            ts: 239 + index,
          }),
        ),
      };
    }
    return {
      currentSequence: 740,
      events: [739, 740].map((sequence) =>
        event({
          eventId: `event-${sequence}`,
          dealRoomId: 'room-1',
          sequence,
          type: 'deal.room.state.changed',
          ts: sequence,
        }),
      ),
    };
  });

  assert.deepEqual(requested, [238, 738]);
  assert.equal(missing.length, 502);
  assert.deepEqual(missing.slice(-2).map((item) => item.sequence), [739, 740]);
});
