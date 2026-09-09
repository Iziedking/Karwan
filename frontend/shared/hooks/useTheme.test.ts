import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDaylightTheme } from './useTheme';

test('daylight mode uses local daytime boundaries', () => {
  assert.equal(resolveDaylightTheme(new Date(2026, 0, 15, 6, 59)), 'dark');
  assert.equal(resolveDaylightTheme(new Date(2026, 0, 15, 7, 0)), 'light');
  assert.equal(resolveDaylightTheme(new Date(2026, 0, 15, 18, 59)), 'light');
  assert.equal(resolveDaylightTheme(new Date(2026, 0, 15, 19, 0)), 'dark');
});

test('daylight mode uses the device local timezone rules', () => {
  const daylightBoundary = new Date(2026, 2, 8, 7, 0);
  assert.equal(daylightBoundary.getHours(), 7);
  assert.equal(resolveDaylightTheme(daylightBoundary), 'light');
});
