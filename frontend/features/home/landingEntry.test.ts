import assert from 'node:assert/strict';
import test from 'node:test';
import { landingEntryRoutes } from './landingEntry';
import { dealRouteBlocked, TESTNET_ORIGIN } from '../../shared/utils/routes';

test('testnet discovery is public and creating a deal preserves direct mode and the form anchor', () => {
  const entry = landingEntryRoutes(true);
  // Open Karwan lands on Home (owner, 9 Nov 2026); the market keeps its own link.
  assert.equal(entry.primary, '/app');
  assert.equal(entry.home, entry.primary);
  assert.equal(entry.secondary, '/buyer?mode=direct#new-deal');
  assert.equal(entry.agreement, entry.secondary);
  assert.equal(entry.market, '/market');
});

test('mainnet offers the waitlist and sends every public trade action to the testnet task', () => {
  const entry = landingEntryRoutes(false);
  assert.equal(entry.primary, '/waitlist');
  assert.equal(entry.secondary, TESTNET_ORIGIN + '/market');
  const deal = new URL(entry.agreement);
  assert.equal(deal.origin, TESTNET_ORIGIN);
  assert.equal(deal.pathname, '/buyer');
  assert.equal(deal.searchParams.get('mode'), 'direct');
  assert.equal(deal.hash, '#new-deal');
  for (const href of Object.values(entry)) {
    if (href.startsWith('/')) assert.equal(dealRouteBlocked(href, false), false, href);
  }
});
