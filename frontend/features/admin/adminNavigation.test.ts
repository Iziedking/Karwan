import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_NAVIGATION, adminNavigationForRole, adminNavigationItem } from './adminNavigation';

test('admin navigation contains unique routes and the API directory', () => {
  const items = ADMIN_NAVIGATION.flatMap((group) => group.items);
  assert.equal(new Set(items.map((item) => item.href)).size, items.length);
  assert.ok(items.some((item) => item.href === '/admin/routes'));
});

test('support role only sees its scoped workspace', () => {
  assert.deepEqual(
    adminNavigationForRole('support').flatMap((group) => group.items.map((item) => item.href)),
    ['/admin/support'],
  );
});

test('active item resolves exact and nested admin paths', () => {
  assert.equal(adminNavigationItem('/admin')?.label, 'Control room');
  assert.equal(adminNavigationItem('/admin/deals/example')?.label, 'Deals');
});
