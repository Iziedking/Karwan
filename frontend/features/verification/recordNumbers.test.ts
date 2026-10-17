import assert from 'node:assert/strict';
import test from 'node:test';
import { recordCopy } from '@/shared/i18n/messages/record';
import { recordNumbers } from './recordNumbers';

const copy = recordCopy.en;

test('the record reads the score with the tier, and the counts in words', () => {
  const n = recordNumbers({ score: 82, counts: { completed: 12, onTimeRate: 92, disputesLost: 0 } }, copy);
  assert.deepEqual(n, [
    { label: 'Score', value: '82 of 100' },
    { label: 'Completed deals', value: '12' },
    { label: 'On time', value: '92%' },
    { label: 'Disputes lost', value: '0' },
  ]);
});

test('on time is left out under three timed deliveries, and an empty record says so', () => {
  const n = recordNumbers({ score: 12, counts: { completed: 0, onTimeRate: null, disputesLost: 0 } }, copy);
  assert.deepEqual(n.map((r) => r.label), ['Score', 'Completed deals', 'Disputes lost']);
  assert.equal(n[1]!.value, '0');
});

test('an older API without numbers shows none', () => {
  assert.deepEqual(recordNumbers({}, copy), []);
});

test('every locale has the new keys and no em dash', () => {
  for (const loc of ['ar', 'fr', 'hi', 'sw'] as const) {
    for (const k of ['score', 'scoreOf', 'completed', 'onTime', 'disputesLost', 'sources', 'sourceKarwan', 'connected', 'otherPlatforms', 'noPartners'] as const) {
      assert.ok(recordCopy[loc][k], `${loc}.${k}`);
      assert.doesNotMatch(recordCopy[loc][k], /—/);
    }
  }
});

test('a sealed record shows no numbers and says Karwan never shares them', async () => {
  const { readFileSync } = await import('node:fs');
  const view = readFileSync(new URL('./RecordView.tsx', import.meta.url), 'utf8');
  assert.match(view, /record\.sealed \? <p[^>]*>\{sealed\.noNumbers\}<\/p>/);
  const api = readFileSync(new URL('../../core/api.ts', import.meta.url), 'utf8');
  assert.match(api, /record: \(tag: string\) =>[\s\S]*?sealed\?: true;[\s\S]*?\/api\/r\//);
});
