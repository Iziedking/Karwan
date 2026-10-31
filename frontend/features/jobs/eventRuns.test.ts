import assert from 'node:assert/strict';
import test from 'node:test';
import { eventRuns } from './eventRuns';

type Row = { type: string; actor: string; chips: string };
const row = (type: string, actor: string, chips = ''): Row => ({ type, actor, chips });
const same = (a: Row, b: Row) => a.type === b.type && a.actor === b.actor && a.chips === b.chips;

test('rows that read the same and sit together fold into one with a count', () => {
  const runs = eventRuns([
    row('scan', 'buyer', 'Offers 1 · Matched 0'),
    row('scan', 'buyer', 'Offers 1 · Matched 0'),
    row('skip', 'seller', 'Outside skills'),
    row('skip', 'seller', 'Outside skills'),
    row('skip', 'seller', 'Outside skills'),
  ], same);
  assert.deepEqual(runs.map((r) => [r.item.type, r.repeat]), [['scan', 2], ['skip', 3]]);
});

test('rows apart, or with different details, stay apart, in time order', () => {
  const runs = eventRuns([
    row('scan', 'buyer', 'Offers 1'),
    row('skip', 'seller', 'Outside skills'),
    row('scan', 'buyer', 'Offers 1'),
    row('scan', 'buyer', 'Offers 2'),
  ], same);
  assert.deepEqual(runs.map((r) => [r.item.type, r.item.chips, r.repeat]), [
    ['scan', 'Offers 1', 1], ['skip', 'Outside skills', 1], ['scan', 'Offers 1', 1], ['scan', 'Offers 2', 1],
  ]);
});

test('nothing in, nothing out', () => {
  assert.deepEqual(eventRuns([], same), []);
});
