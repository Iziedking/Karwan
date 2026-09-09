import assert from 'node:assert/strict';
import test from 'node:test';
import { TOUR_LAUNCHER_VISIBLE_MS, tourLauncherStorageKey } from './tourLauncher';

test('tour launcher remains discoverable long enough to act', () => {
  assert.equal(TOUR_LAUNCHER_VISIBLE_MS, 12_000);
});

test('tour launcher persistence is scoped to the tour and version', () => {
  assert.equal(tourLauncherStorageKey('profile'), 'karwan:tour-launcher:v1:profile');
  assert.notEqual(tourLauncherStorageKey('profile'), tourLauncherStorageKey('settings'));
});
