import assert from 'node:assert/strict';
import test from 'node:test';
import { navHref, workspaceNavItems } from './workspaceNav';

/// One list feeds the phone bar and the desktop rail (view 44, D8 and D11).
///
///   npx tsx --test shared/components/workspaceNav.test.ts

test('phone: four tabs, Deals third', () => {
  assert.deepEqual(workspaceNavItems({ surface: 'phone', dealsAvailable: true, financeEnabled: true }), ['home', 'market', 'deals', 'profile']);
});

test('desktop: Money and Messages, Finance only when on', () => {
  assert.deepEqual(workspaceNavItems({ surface: 'desktop', dealsAvailable: true, financeEnabled: false }), ['home', 'market', 'deals', 'money', 'messages']);
  assert.deepEqual(workspaceNavItems({ surface: 'desktop', dealsAvailable: true, financeEnabled: true }), ['home', 'market', 'deals', 'money', 'messages', 'finance']);
});

test('wallet-only network: no Deals, Activity kept, Home is the money page', () => {
  assert.deepEqual(workspaceNavItems({ surface: 'phone', dealsAvailable: false, financeEnabled: false }), ['home', 'activity', 'profile']);
  assert.deepEqual(workspaceNavItems({ surface: 'desktop', dealsAvailable: false, financeEnabled: true }), ['home', 'activity']);
});

test('every item has one address', () => {
  assert.equal(navHref('home', '/app'), '/app');
  assert.equal(navHref('market', '/app'), '/market');
  assert.equal(navHref('deals', '/app'), '/deals');
  assert.equal(navHref('money', '/app'), '/account');
  assert.equal(navHref('messages', '/app'), '/messages');
  assert.equal(navHref('finance', '/app'), '/financier');
  assert.equal(navHref('activity', '/app'), '/activity');
  assert.equal(navHref('profile', '/app'), '/profile');
});
