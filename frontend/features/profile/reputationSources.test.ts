import assert from 'node:assert/strict';
import test from 'node:test';
import { reputationSourcesCopy } from '@/shared/i18n/messages/reputationSources';
import { readerLine } from './reputationSources';

const copy = reputationSourcesCopy.en;
const at = Date.UTC(2026, 9, 15);

test('a reader reads as their tag, why they read and the day, never the price', () => {
  assert.equal(readerLine({ name: 'Tunde', tag: 'tunde', purpose: 'shortlist', at }, copy, 'en'), '@tunde · For a request · Oct 15');
  assert.equal(readerLine({ name: 'Ada', tag: null, purpose: 'bid', at }, copy, 'en'), 'Ada · Before an offer · Oct 15');
  assert.equal(readerLine({ name: null, tag: null, purpose: 'question', at }, copy, 'en'), 'A Karwan member · For a question · Oct 15');
});

test('every locale has every key and no em dash', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k])).sort();
  for (const loc of ['ar', 'fr', 'hi', 'sw'] as const) {
    assert.deepEqual(keys(reputationSourcesCopy[loc]), keys(copy), loc);
    assert.doesNotMatch(JSON.stringify(reputationSourcesCopy[loc]), /—/);
  }
});
