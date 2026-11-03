import assert from 'node:assert/strict';
import test from 'node:test';
import { ownRecord, recordSummary, type RecordRead } from './ownRecord';

/// Your record on Profile, in plain words (view 44, P9).
///
///   npx tsx --test features/profile/ownRecord.test.ts

const read = (over: Partial<RecordRead> = {}): RecordRead => ({
  displayName: 'Ada', tag: 'ada', level: 'person_verified', tier: 'ESTABLISHED', reasons: [], facts: [], ...over,
});

test('on time is already a percent from the record read, so 98 shows as 98, never 9800', () => {
  const mine = ownRecord(read({ counts: { completed: 90, onTimeRate: 98, disputesLost: 0 } }));
  assert.equal(mine?.kind === 'record' ? mine.onTimePct : undefined, 98);
});

test('your record says what you have done, or that you are new', () => {
  assert.equal(ownRecord(undefined), null);
  assert.deepEqual(ownRecord(read()), { kind: 'new' });
  assert.deepEqual(ownRecord(read({ counts: { completed: 0, onTimeRate: null, disputesLost: 0 } })), { kind: 'new' });
  assert.deepEqual(
    ownRecord(read({ counts: { completed: 23, onTimeRate: 96, disputesLost: 1 }, rating: { kind: 'rated', value: 4.8, count: 23 } })),
    { kind: 'record', completed: 23, onTimePct: 96, problemsLost: 1, rating: { kind: 'rated', value: 4.8, count: 23 } },
  );
  assert.deepEqual(
    ownRecord(read({ counts: { completed: 2, onTimeRate: null, disputesLost: 0 } })),
    { kind: 'record', completed: 2, onTimePct: null, problemsLost: 0, rating: null },
  );
});

test('Profile sums the record up in one line: the level and the deals done (view 48, batch 9e)', () => {
  const words = { tier: (t: string) => (t === 'ESTABLISHED' ? 'Established' : t), newHere: 'New on Karwan', completed: '{n} deals completed', completedOne: '1 deal completed' };
  assert.equal(recordSummary(undefined, words), null);
  assert.equal(recordSummary(read(), words), 'New on Karwan');
  assert.equal(recordSummary(read({ counts: { completed: 23, onTimeRate: 96, disputesLost: 0 } }), words), 'Established · 23 deals completed');
  assert.equal(recordSummary(read({ counts: { completed: 1, onTimeRate: null, disputesLost: 0 } }), words), 'Established · 1 deal completed');
});
