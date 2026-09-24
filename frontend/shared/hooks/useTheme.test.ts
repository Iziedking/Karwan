import test from 'node:test';
import assert from 'node:assert/strict';
import { isAlwaysDarkRoute, resolveDaylightTheme, themeForRoute } from './useTheme';

test('the landing page is always dark and every other route follows the stored preference', () => {
  const noon = new Date(2026, 8, 24, 12, 0);
  const night = new Date(2026, 8, 24, 21, 0);
  for (const pref of ['light', 'dark', 'system'] as const) {
    assert.equal(themeForRoute('/', pref, noon), 'dark');
  }
  assert.equal(themeForRoute('/app', 'light', noon), 'light');
  assert.equal(themeForRoute('/app', 'dark', noon), 'dark');
  assert.equal(themeForRoute('/app', 'system', noon), 'light');
  assert.equal(themeForRoute('/app', 'system', night), 'dark');
  assert.equal(themeForRoute('/how-it-works', 'light', noon), 'light');
  assert.equal(isAlwaysDarkRoute('/'), true);
  assert.equal(isAlwaysDarkRoute('/docs'), false);
  assert.equal(isAlwaysDarkRoute(null), false);
});

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
