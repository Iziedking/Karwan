import assert from 'node:assert/strict';
import test from 'node:test';
import { GAP_MS, QUIET_MS, URGENT_GAP_MS, afterCame, afterNotNow, freshPace, mayCome, readPace, resetPace, writePace } from './amanPace';

/// Aman comes in at longer intervals, stays away a long time after Not now,
/// and is back at every new sign-in (owner, 16 Nov 2026).

const T = Date.UTC(2026, 10, 16, 12);

test('a fresh sign-in lets Aman come in at once', () => {
  assert.equal(mayCome(freshPace(), T, false), true);
});

test('after a line, the next waits the gap; something urgent waits less', () => {
  const p = afterCame(freshPace(), T);
  assert.equal(mayCome(p, T + 60_000, false), false);
  assert.equal(mayCome(p, T + URGENT_GAP_MS, true), true);
  assert.equal(mayCome(p, T + URGENT_GAP_MS, false), false);
  assert.equal(mayCome(p, T + GAP_MS, false), true);
});

test('Not now keeps Aman away for a day, urgent or not', () => {
  const p = afterNotNow(freshPace(), T);
  assert.equal(mayCome(p, T + GAP_MS * 3, true), false);
  assert.equal(mayCome(p, T + QUIET_MS, false), true);
});

test('the pace survives a reload and a sign-in clears it', () => {
  const kept = new Map<string, string>();
  const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  writePace(store, afterNotNow(freshPace(), T));
  assert.equal(mayCome(readPace(store), T + 1000, false), false);
  resetPace(store);
  assert.equal(mayCome(readPace(store), T + 1000, false), true);
  kept.set('karwan:aman:pace', '{bad');
  assert.deepEqual(readPace(store), freshPace());
});
