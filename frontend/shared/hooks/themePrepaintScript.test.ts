import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { THEME_PREPAINT_SCRIPT } from './themePrepaintScript';
import { themeForRoute, themeFromStored, type Theme } from './useTheme';

/// Runs the real script against a stand-in document that starts as the server
/// markup does (data-theme="dark") and reports what it painted.
function prepaint(pathname: string, stored: string | null, storageBlocked = false): Theme {
  const attributes = new Map<string, string>([['data-theme', 'dark']]);
  runInNewContext(THEME_PREPAINT_SCRIPT, {
    location: { pathname },
    localStorage: {
      getItem: (key: string) => {
        if (storageBlocked) throw new Error('storage blocked');
        return key === 'karwan-theme' ? stored : null;
      },
    },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        removeAttribute: (name: string) => attributes.delete(name),
      },
    },
  });
  return attributes.get('data-theme') === 'dark' ? 'dark' : 'light';
}

test('the pre-paint script paints what the theme hook paints, route by route', () => {
  for (const pathname of ['/', '/app', '/docs', '/profile', '/deals/0xabc']) {
    for (const stored of [null, 'light', 'dark', 'system', 'unrecognised']) {
      assert.equal(
        prepaint(pathname, stored),
        themeForRoute(pathname, themeFromStored(stored)),
        `${pathname} stored=${stored}`,
      );
    }
  }
});

test('no saved theme, an old Daylight choice or blocked storage all paint dark before first paint', () => {
  assert.equal(prepaint('/docs', null), 'dark');
  assert.equal(prepaint('/docs', 'system'), 'dark');
  assert.equal(prepaint('/docs', 'light', true), 'dark');
  assert.equal(prepaint('/docs', 'light'), 'light');
});

test('the landing page paints dark whatever was chosen elsewhere', () => {
  assert.equal(prepaint('/', 'light'), 'dark');
  assert.equal(prepaint('/', 'light', true), 'dark');
});

test('the pre-paint script never reads the clock', () => {
  assert.doesNotMatch(THEME_PREPAINT_SCRIPT, /Date|getHours/);
});
