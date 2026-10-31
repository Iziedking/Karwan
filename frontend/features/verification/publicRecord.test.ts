import assert from 'node:assert/strict';
import test from 'node:test';
import { publicRecord } from './publicRecord';
import type { RecordRead } from '@/features/profile/ownRecord';

/// What others see: words, never numbers (view 44, P10; UI law principle 3).
///
///   npx tsx --test features/verification/publicRecord.test.ts

const read = (over: Partial<RecordRead> = {}): RecordRead => ({
  displayName: 'Ada Obi', tag: 'ada', level: 'person_verified', tier: 'ESTABLISHED', reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME', 'NO_LOST_DISPUTES', 'VERIFIED_PERSON'] as RecordRead['reasons'], facts: [],
  score: 512, counts: { completed: 23, onTimeRate: 0.95, disputesLost: 0 }, rating: { kind: 'rated', value: 4.8, count: 23 }, ...over,
});

test('the public record keeps words and drops every number', () => {
  const out = publicRecord(read());
  assert.deepEqual(out, {
    name: 'Ada Obi', tag: 'ada', verifiedPerson: true, tier: 'ESTABLISHED', rating: { kind: 'rated', value: 4.8, count: 23 },
    reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME', 'NO_LOST_DISPUTES'],
  });
  assert.equal('score' in out, false);
  assert.equal('counts' in out, false);
});

test('a person not yet verified, with no rating, reads as new', () => {
  const out = publicRecord(read({ level: 'registered', rating: undefined, reasons: [] as RecordRead['reasons'], displayName: null }));
  assert.equal(out.verifiedPerson, false);
  assert.deepEqual(out.rating, { kind: 'new', count: 0 });
  assert.equal(out.name, null);
});
