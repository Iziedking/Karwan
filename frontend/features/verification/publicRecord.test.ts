import assert from 'node:assert/strict';
import test from 'node:test';
import { publicRecord } from './publicRecord';
import type { RecordRead } from '@/features/profile/ownRecord';

/// What others see: words and the deal counts, never the score (view 44, P10;
/// unsealed by the owner, 3 Nov 2026).
///
///   npx tsx --test features/verification/publicRecord.test.ts

const read = (over: Partial<RecordRead> = {}): RecordRead => ({
  displayName: 'Ada Obi', tag: 'ada', level: 'person_verified', tier: 'ESTABLISHED', reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME', 'NO_LOST_DISPUTES', 'VERIFIED_PERSON'] as RecordRead['reasons'], facts: [],
  score: 512, counts: { completed: 23, onTimeRate: 95, disputesLost: 0 }, rating: { kind: 'rated', value: 4.8, count: 23 }, ...over,
});

test('the public record keeps words and the deal counts, and drops the score', () => {
  const out = publicRecord(read());
  assert.deepEqual(out, {
    name: 'Ada Obi', tag: 'ada', verifiedPerson: true, tier: 'ESTABLISHED', rating: { kind: 'rated', value: 4.8, count: 23 },
    reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME', 'NO_LOST_DISPUTES'],
    deals: { done: 23, onTimePct: 95 },
  });
  assert.equal('score' in out, false);
});

test('no deals yet, or a server that sends no counts, shows no deal facts', () => {
  assert.equal(publicRecord(read({ counts: { completed: 0, onTimeRate: null, disputesLost: 0 } })).deals, null);
  assert.equal(publicRecord(read({ counts: undefined })).deals, null);
});

test('a person not yet verified, with no rating, reads as new', () => {
  const out = publicRecord(read({ level: 'registered', rating: undefined, reasons: [] as RecordRead['reasons'], displayName: null }));
  assert.equal(out.verifiedPerson, false);
  assert.deepEqual(out.rating, { kind: 'new', count: 0 });
  assert.equal(out.name, null);
});
