import assert from 'node:assert/strict';
import test from 'node:test';
import { dealsAvailableOn, isDealRoute } from './routes';

test('wallet surfaces stay open on a wallet-only deployment', () => {
  for (const path of ['/', '/account', '/activity', '/bridge', '/deposit', '/profile', '/settings', '/onboarding', '/docs', '/docs/escrow', '/terms']) {
    assert.equal(isDealRoute(path), false, path);
  }
});

test('deal surfaces, including their detail pages, are gated', () => {
  for (const path of ['/app', '/p2p', '/b2b', '/deals/0xabc', '/jobs/12', '/market', '/listings/x', '/financier', '/stake', '/cashout/0xabc', '/invite/t']) {
    assert.equal(isDealRoute(path), true, path);
  }
  assert.equal(isDealRoute('/apple-icon.png'), false, 'prefix match is by path segment');
});

test('deals are available everywhere except mainnet', () => {
  assert.equal(dealsAvailableOn(undefined), true);
  assert.equal(dealsAvailableOn('testnet'), true);
  assert.equal(dealsAvailableOn(' Mainnet '), false);
});
