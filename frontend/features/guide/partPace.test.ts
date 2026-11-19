import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECK_IN_MS, VISIT_GAP_MS, checkInDue, visitOffer, comesOnVisit, countVisit, knowsKarwan, mergeCounts, mergeHeard, pageKey, readSeenAt, writeSeenAt,
} from './partPace';

/// Aman comes about half as often on each visit to a page, then only checks in
/// now and then (view 57, 19 Nov).

const T = Date.UTC(2026, 10, 19, 12);

test('a page key keeps the page and drops ids', () => {
  assert.equal(pageKey('/deals/8f2c1a9e0b7d4c3e?x=1'), '/deals/*');
  assert.equal(pageKey('/market/'), '/market');
  assert.equal(pageKey('/profile/0xAbC123'), '/profile/*');
  assert.equal(pageKey('/r/12345'), '/r/*');
  assert.equal(pageKey('/settings'), '/settings');
  assert.equal(pageKey('/agent-jobs/ref_aZ09bcdefghijklmnopq#top'), '/agent-jobs/*');
  assert.equal(pageKey('/'), '/');
});

test('Aman comes on visits 1, 2, 4 and 8, then not on its own', () => {
  for (const n of [1, 2, 4, 8]) assert.equal(comesOnVisit(n), true, `visit ${n}`);
  for (const n of [0, 3, 5, 9, 16]) assert.equal(comesOnVisit(n), false, `visit ${n}`);
});

test('a visit counts once per page every 30 minutes on this device', () => {
  const first = countVisit({ counts: {}, seenAt: {}, key: '/app', now: T });
  assert.deepEqual([first.counted, first.visit, first.counts['/app']], [true, 1, 1]);
  const soon = countVisit({ counts: first.counts, seenAt: first.seenAt, key: '/app', now: T + 10 * 60_000 });
  assert.deepEqual([soon.counted, soon.visit, soon.counts['/app']], [false, 1, 1]);
  const later = countVisit({ counts: soon.counts, seenAt: soon.seenAt, key: '/app', now: T + VISIT_GAP_MS + 60_000 });
  assert.deepEqual([later.counted, later.visit], [true, 2]);
});

test('counts from two devices merge to the higher, junk dropped, 200 pages at most', () => {
  assert.deepEqual(mergeCounts({ a: 3, b: 1 }, { a: 2, b: 4, c: 1 }), { a: 3, b: 4, c: 1 });
  assert.deepEqual(mergeCounts({ '/App': 5, '/x': -1, '/y': 1.5 } as Record<string, number>, { '/z': 2 }), { '/z': 2 });
  assert.deepEqual(mergeCounts(undefined, undefined), {});
  const many = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`/p${i}`, i + 1]));
  const kept = mergeCounts(many, {});
  assert.equal(Object.keys(kept).length, 200);
  assert.equal(kept['/p249'], 250);
  assert.equal(kept['/p0'], undefined);
});

test('heard parts merge without repeats, junk dropped, the last 300 kept', () => {
  assert.deepEqual(mergeHeard(['a-1', 'b-2'], ['b-2', 'c-3', 'Bad Id']), ['a-1', 'b-2', 'c-3']);
  const many = Array.from({ length: 320 }, (_, i) => `part-${i}`);
  const kept = mergeHeard(many, []);
  assert.equal(kept.length, 300);
  assert.equal(kept[0], 'part-20');
});

test('someone knows Karwan once four pages had eight visits', () => {
  assert.equal(knowsKarwan({ a: 8, b: 8, c: 9 }), false);
  assert.equal(knowsKarwan({ a: 8, b: 8, c: 9, d: 12 }), true);
});

test('a check-in comes only to someone who knows Karwan, every 14 days at most', () => {
  const knows = { a: 8, b: 8, c: 8, d: 8 };
  assert.equal(checkInDue({ a: 1 }, undefined, T), false);
  assert.equal(checkInDue(knows, undefined, T), true);
  assert.equal(checkInDue(knows, T - 13 * 86_400_000, T), false);
  assert.equal(checkInDue(knows, T - CHECK_IN_MS, T), true);
});

test('when each page was last counted stays on the device, and bad storage is ignored', () => {
  const box = new Map<string, string>();
  const store = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
  writeSeenAt(store, { '/app': T });
  assert.deepEqual(readSeenAt(store), { '/app': T });
  box.set('karwan:aman:seen-at', '{"/app":"soon"}');
  assert.deepEqual(readSeenAt(store), {});
  assert.deepEqual(readSeenAt(null), {});
  assert.doesNotThrow(() => writeSeenAt({ setItem: () => { throw new Error('blocked'); } }, {}));
});

test('what a visit offers: the hello first, then parts on the schedule, then a check-in', () => {
  const knows = { a: 8, b: 8, c: 8, d: 8 };
  assert.equal(visitOffer({ hiDone: false, counted: true, visit: 3, counts: {}, lastCheckInAt: undefined, now: T }), 'hello');
  assert.equal(visitOffer({ hiDone: true, counted: true, visit: 1, counts: {}, lastCheckInAt: undefined, now: T }), 'parts');
  assert.equal(visitOffer({ hiDone: true, counted: true, visit: 4, counts: knows, lastCheckInAt: undefined, now: T }), 'parts');
  assert.equal(visitOffer({ hiDone: true, counted: true, visit: 3, counts: {}, lastCheckInAt: undefined, now: T }), null);
  assert.equal(visitOffer({ hiDone: true, counted: true, visit: 9, counts: knows, lastCheckInAt: undefined, now: T }), 'check-in');
  assert.equal(visitOffer({ hiDone: true, counted: true, visit: 9, counts: knows, lastCheckInAt: T - 86_400_000, now: T }), null);
});

test('coming back to a page within the half hour offers nothing new', () => {
  assert.equal(visitOffer({ hiDone: true, counted: false, visit: 1, counts: {}, lastCheckInAt: undefined, now: T }), null);
  assert.equal(visitOffer({ hiDone: false, counted: false, visit: 1, counts: {}, lastCheckInAt: undefined, now: T }), 'hello');
});
