import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { THEME_PREPAINT_SCRIPT } from './themePrepaintScript';
import { themeForRoute, type Theme, type ThemePreference } from './useTheme';

/// Runs the real script against a stand-in document and reports what it painted.
function prepaint(pathname: string, stored: string | null, hour: number, storageBlocked = false): Theme {
  const attributes = new Map<string, string>();
  class ClockAt extends Date {
    constructor() {
      super(2026, 8, 24, hour, 30);
    }
  }
  runInNewContext(THEME_PREPAINT_SCRIPT, {
    location: { pathname },
    localStorage: {
      getItem: (key: string) => {
        if (storageBlocked) throw new Error('storage blocked');
        return key === 'karwan-theme' ? stored : null;
      },
    },
    document: { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } },
    Date: ClockAt,
  });
  return attributes.get('data-theme') === 'dark' ? 'dark' : 'light';
}

function storedPreference(stored: string | null): ThemePreference {
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
}

test('the pre-paint script paints what the theme hook paints, route by route', () => {
  for (const pathname of ['/', '/app', '/docs', '/how-it-works', '/deals/0xabc']) {
    for (const stored of [null, 'light', 'dark', 'system', 'unrecognised']) {
      for (const hour of [3, 7, 12, 18, 19, 23]) {
        assert.equal(
          prepaint(pathname, stored, hour),
          themeForRoute(pathname, storedPreference(stored), new Date(2026, 8, 24, hour, 30)),
          `${pathname} stored=${stored} at ${hour}:30`,
        );
      }
    }
  }
});

test('the landing page paints dark whatever was chosen elsewhere', () => {
  assert.equal(prepaint('/', 'light', 12), 'dark');
  assert.equal(prepaint('/', 'system', 12), 'dark');
  assert.equal(prepaint('/', 'light', 12, true), 'dark');
  assert.equal(prepaint('/docs', 'light', 12), 'light');
  assert.equal(prepaint('/docs', null, 12), 'dark');
});
