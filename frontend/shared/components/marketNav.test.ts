import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MARKET_HREF, isMarketRoute } from './marketNav';

/// One Market in the navigation for every account (view 17). Everything you
/// trade from lights Market; a deal lights Deals (view 44).
///
///   npx tsx --test shared/components/marketNav.test.ts

test('Market is one address for every account', () => {
  assert.equal(MARKET_HREF, '/market');
});

test('every trading page lights Market', () => {
  for (const path of ['/market', '/listings/abc', '/jobs/0x1', '/buyer', '/seller', '/cashout/0x3']) {
    assert.equal(isMarketRoute(path), true, path);
  }
  for (const path of ['/app', '/activity', '/profile', '/marketplace-x', '/deals', '/deals/0x2']) assert.equal(isMarketRoute(path), false, path);
});

test('neither navigation links to the old trade hubs or parked pages', () => {
  for (const file of ['WorkspaceBottomNav.tsx', 'TopNav.tsx']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /'\/(p2p|b2b|partners|supply)'/, file);
    assert.doesNotMatch(source, /smeTrades|t\.trades\b/, file);
  }
});
