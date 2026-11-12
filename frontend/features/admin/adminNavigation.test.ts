import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DESK_GROUPS, canOpenPath, deskItemFor, jumpTo, pageAccess, sidebarFor, tabsFor, type DeskMe } from './adminNavigation';
import { DESK_REDIRECTS, deskRedirectFor } from './deskRedirects.mjs';

const owner: DeskMe = { owner: true, access: {} };
const member = (access: DeskMe['access']): DeskMe => ({ owner: false, access });
const labels = (me: DeskMe) => sidebarFor(me).flatMap((g) => g.items.map((i) => i.label));

test('the owner sees all 23 pages in the order of the view', () => {
  assert.deepEqual(labels(owner), [
    'Home', 'Waiting for you', 'Support', 'Team room',
    'Accounts', 'Businesses', 'Waitlist and survey', 'Updates', 'Newsletter', 'Feedback',
    'Deals', 'Disputes', 'Money moves', 'Treasury and yield',
    'Matching', 'Agents',
    'Health', 'Errors', 'Activity log', 'API directory',
    'Team and pages', 'Keys', 'Settings',
  ]);
  assert.deepEqual(sidebarFor(owner).map((g) => g.label), ['Today', 'People', 'Deals and money', 'Market', 'System', 'Team']);
  const hrefs = DESK_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test('a teammate ticked only for yield sees Treasury and yield, and only its yield part', () => {
  const me = member({ usyc: 'read' });
  const money = sidebarFor(me).find((g) => g.label === 'Deals and money');
  assert.deepEqual(money?.items.map((i) => i.label), ['Treasury and yield']);
  assert.deepEqual(tabsFor(me, '/admin/treasury').map((t) => t.key), ['yield']);
  assert.deepEqual(tabsFor(owner, '/admin/treasury').map((t) => t.key), ['treasury', 'yield']);
});

test('the API directory shows only for the owner or a teammate ticked for it', () => {
  assert.equal(labels(owner).includes('API directory'), true);
  assert.equal(labels(member({ errors: 'fix' })).includes('API directory'), false);
  assert.equal(labels(member({ routes: 'read' })).includes('API directory'), true);
});

test('a support teammate sees Home, Waiting for you, Support, Team room and Keys', () => {
  assert.deepEqual(labels(member({ support: 'change' })), ['Home', 'Waiting for you', 'Support', 'Team room', 'Keys']);
});

test('team, pages, team keys and settings stay with the owner', () => {
  const all = member(Object.fromEntries(DESK_GROUPS.flatMap((g) => g.items.flatMap((i) => i.keys)).map((k) => [k, 'fix' as const])));
  for (const label of ['Team and pages', 'Settings']) assert.equal(labels(all).includes(label), false, label);
  assert.deepEqual(tabsFor(all, '/admin/keys').map((t) => t.key), ['yours']);
  assert.deepEqual(tabsFor(owner, '/admin/keys').map((t) => t.key), ['yours', 'team']);
});

test('the level on a page is the highest over its keys', () => {
  assert.equal(pageAccess(member({ usyc: 'fix' }), ['treasury', 'usyc']), 'fix');
  assert.equal(pageAccess(member({ treasury: 'read', usyc: 'change' }), ['treasury', 'usyc']), 'change');
  assert.equal(pageAccess(member({ deals: 'fix' }), ['treasury', 'usyc']), null);
  assert.equal(pageAccess(owner, ['treasury']), 'fix');
});

test('an address opens its page, nested addresses included, and only for those who have it', () => {
  assert.equal(deskItemFor('/admin')?.label, 'Home');
  assert.equal(deskItemFor('/admin/support/room')?.label, 'Team room');
  assert.equal(deskItemFor('/admin/support')?.label, 'Support');
  assert.equal(deskItemFor('/admin/deals/0x7b2e')?.label, 'Deals');
  assert.equal(canOpenPath(member({ support: 'read' }), '/admin/support/room'), true);
  assert.equal(canOpenPath(member({ support: 'read' }), '/admin/deals'), false);
  assert.equal(canOpenPath(member({ support: 'read' }), '/admin/waiting'), true);
  assert.equal(canOpenPath(member({ support: 'read' }), '/admin/settings'), false);
  assert.equal(canOpenPath(owner, '/admin/settings'), true);
});

test('every old address goes to the page that took it over', () => {
  const sources = Object.fromEntries(DESK_REDIRECTS.map((r) => [r.source, r.destination]));
  assert.deepEqual(sources, {
    '/admin/profiles': '/admin/accounts',
    '/admin/approvals': '/admin/waiting',
    '/admin/runtime': '/admin/agents',
    '/admin/signals': '/admin/agents?tab=signals',
    '/admin/diagnostics': '/admin/health',
    '/admin/events': '/admin/activity?tab=events',
    '/admin/log': '/admin/activity',
    '/admin/usyc': '/admin/treasury?tab=yield',
    '/admin/survey': '/admin/waitlist?tab=survey',
    '/admin/access': '/admin/team?tab=pages',
    '/admin/team-keys': '/admin/keys?tab=team',
    '/admin/payments': '/admin/money',
  });
  const hrefs = new Set(DESK_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  for (const r of DESK_REDIRECTS) {
    const [path, query] = r.destination.split('?');
    assert.ok(hrefs.has(path!), r.destination);
    if (query) assert.ok(tabsFor(owner, path!).some((t) => `tab=${t.key}` === query), r.destination);
  }
});

test('the search finds pages and their parts by plain words, only among the teammate’s pages', () => {
  assert.deepEqual(jumpTo(owner, 'signals'), [{ label: 'Agents · Signals', group: 'Market', href: '/admin/agents?tab=signals' }]);
  assert.deepEqual(jumpTo(owner, 'yield').map((r) => r.href), ['/admin/treasury', '/admin/treasury?tab=yield']);
  assert.deepEqual(jumpTo(owner, '  MONEY ').map((r) => r.href), ['/admin/money']);
  assert.deepEqual(jumpTo(member({ support: 'read' }), 'deal'), []);
  assert.equal(jumpTo(owner, '').length, 23);
  assert.equal(jumpTo(member({ support: 'read' }), '').length, 5);
});

test('an old address moves only after the desk gate, so the public site never hints the desk is there', () => {
  assert.equal(deskRedirectFor('/admin/usyc'), '/admin/treasury?tab=yield');
  assert.equal(deskRedirectFor('/admin/profiles'), '/admin/accounts');
  assert.equal(deskRedirectFor('/admin/usyc/extra'), null);
  assert.equal(deskRedirectFor('/admin/accounts'), null);
  assert.equal(deskRedirectFor('/market'), null);
  const config = readFileSync(new URL('../../next.config.mjs', import.meta.url), 'utf8');
  assert.equal(config.includes('DESK_REDIRECTS'), false, 'next.config redirects run before the middleware gate');
});
