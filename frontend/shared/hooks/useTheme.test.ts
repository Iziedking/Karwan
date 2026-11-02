import test from 'node:test';
import assert from 'node:assert/strict';
import * as theme from './useTheme';
import { isAlwaysDarkRoute, themeForRoute, themeFromStored } from './useTheme';

test('a device with no saved theme, or an old Daylight one, paints dark', () => {
  assert.equal(themeFromStored(null), 'dark');
  assert.equal(themeFromStored(''), 'dark');
  assert.equal(themeFromStored('system'), 'dark');
  assert.equal(themeFromStored('unrecognised'), 'dark');
  assert.equal(themeFromStored('dark'), 'dark');
  assert.equal(themeFromStored('light'), 'light');
});

test('the landing page is always dark and every other route follows the saved theme', () => {
  assert.equal(themeForRoute('/', 'light'), 'dark');
  assert.equal(themeForRoute('/', 'dark'), 'dark');
  assert.equal(themeForRoute('/app', 'light'), 'light');
  assert.equal(themeForRoute('/app', 'dark'), 'dark');
  assert.equal(themeForRoute('/profile', 'light'), 'light');
  assert.equal(themeForRoute('/how-it-works', 'light'), 'light');
  assert.equal(isAlwaysDarkRoute('/'), true);
  assert.equal(isAlwaysDarkRoute('/docs'), false);
  assert.equal(isAlwaysDarkRoute(null), false);
});

test('the theme no longer follows the clock', () => {
  assert.equal('resolveDaylightTheme' in theme, false);
  assert.equal('msUntilNextDaylightChange' in theme, false);
});
