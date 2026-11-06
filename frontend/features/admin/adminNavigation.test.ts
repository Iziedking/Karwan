import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_NAVIGATION, adminNavigationFor, adminNavigationItem, canOpen, firstDeskPage } from './adminNavigation';

test('admin navigation contains unique routes and the API directory', () => {
  const items = ADMIN_NAVIGATION.flatMap((group) => group.items);
  assert.equal(new Set(items.map((item) => item.href)).size, items.length);
  assert.ok(items.some((item) => item.href === '/admin/routes'));
});

const hrefs = (me: { owner: boolean; pages: string[] }) => adminNavigationFor(me).flatMap((g) => g.items.map((i) => i.href));

test('a member sees only the pages the owner ticked, plus approvals and their own keys', () => {
  assert.deepEqual(hrefs({ owner: false, pages: ['support'] }), ['/admin/support', '/admin/approvals', '/admin/keys']);
  assert.deepEqual(hrefs({ owner: false, pages: ['deals', 'log'] }), ['/admin/deals', '/admin/approvals', '/admin/log', '/admin/keys']);
});

test('access, team accounts and team keys show only to the owner', () => {
  const member = { owner: false, pages: ADMIN_NAVIGATION.flatMap((g) => g.items.map((i) => i.page)) };
  for (const href of ['/admin/access', '/admin/team', '/admin/team-keys']) {
    assert.equal(hrefs(member).includes(href), false, href);
    assert.equal(hrefs({ owner: true, pages: [] }).includes(href), true, href);
  }
  assert.equal(canOpen({ owner: false, pages: ['owner'] }, 'owner'), false);
});

test('a member lands on their first page', () => {
  assert.equal(firstDeskPage({ owner: false, pages: ['support'] }), '/admin/support');
  assert.equal(firstDeskPage({ owner: true, pages: [] }), '/admin');
});

test('active item resolves exact and nested admin paths', () => {
  assert.equal(adminNavigationItem('/admin')?.label, 'Control room');
  assert.equal(adminNavigationItem('/admin/deals/example')?.label, 'Deals');
});
