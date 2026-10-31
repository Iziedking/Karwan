import assert from 'node:assert/strict';
import test from 'node:test';
import { ownRecord, type RecordRead } from './ownRecord';

/// Your record on Profile, in plain words (view 44, P9).
///
///   npx tsx --test features/profile/ownRecord.test.ts

const read = (over: Partial<RecordRead> = {}): RecordRead => ({
  displayName: 'Ada', tag: 'ada', level: 'person_verified', tier: 'ESTABLISHED', reasons: [], facts: [], ...over,
});

test('your record says what you have done, or that you are new', () => {
  assert.equal(ownRecord(undefined), null);
  assert.deepEqual(ownRecord(read()), { kind: 'new' });
  assert.deepEqual(ownRecord(read({ counts: { completed: 0, onTimeRate: null, disputesLost: 0 } })), { kind: 'new' });
  assert.deepEqual(
    ownRecord(read({ counts: { completed: 23, onTimeRate: 0.957, disputesLost: 1 }, rating: { kind: 'rated', value: 4.8, count: 23 } })),
    { kind: 'record', completed: 23, onTimePct: 96, problemsLost: 1, rating: { kind: 'rated', value: 4.8, count: 23 } },
  );
  assert.deepEqual(
    ownRecord(read({ counts: { completed: 2, onTimeRate: null, disputesLost: 0 } })),
    { kind: 'record', completed: 2, onTimePct: null, problemsLost: 0, rating: null },
  );
});
