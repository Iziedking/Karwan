import assert from 'node:assert/strict';
import test from 'node:test';
import { dealHref, dealRouteBlocked, dealsAvailableOn, isDealRoute } from './routes';

const DEAL = `0x${'ab'.repeat(32)}`;

test('on mainnet a deal’s own page opens, so a chat money link lands on it', () => {
  assert.equal(dealRouteBlocked(`/deals/${DEAL}`, false), false);
  assert.equal(dealRouteBlocked(`/deals/${DEAL.toUpperCase().replace('0X', '0x')}`, false), false);
});

test('on mainnet everything else in the deal rail stays closed', () => {
  for (const path of ['/deals', '/deals/0xabc', `/deals/${DEAL}/extra`, `/jobs/${DEAL}`, '/market', '/app', '/stake', '/buyer']) {
    assert.equal(dealRouteBlocked(path, false), true, path);
  }
});

test('on testnet nothing is blocked', () => {
  for (const path of ['/market', `/deals/${DEAL}`, '/deals/0xabc', '/app']) {
    assert.equal(dealRouteBlocked(path, true), false, path);
  }
});

test('wallet surfaces stay open on a wallet-only deployment', () => {
  for (const path of ['/', '/account', '/activity', '/bridge', '/deposit', '/profile', '/profile/wallets', '/profile/edit', '/settings', '/onboarding', '/docs', '/docs/escrow', '/terms']) {
    assert.equal(isDealRoute(path), false, path);
  }
});

test('deal surfaces, including their detail pages, are gated', () => {
  for (const path of ['/app', '/buyer', '/seller', '/deals/0xabc', '/jobs/12', '/market', '/listings/x', '/financier', '/stake', '/cashout/0xabc', '/invite/t', '/profile/open-deals', '/profile/agent-funds', '/profile/business']) {
    assert.equal(isDealRoute(path), true, path);
  }
  assert.equal(isDealRoute('/apple-icon.png'), false, 'prefix match is by path segment');
});

test('deals are available everywhere except mainnet', () => {
  assert.equal(dealsAvailableOn(undefined), true);
  assert.equal(dealsAvailableOn('testnet'), true);
  assert.equal(dealsAvailableOn(' Mainnet '), false);
});

test('deal links point at testnet from a wallet-only deployment', () => {
  assert.equal(dealHref('/market', true), '/market');
  assert.equal(dealHref('/market', false), 'https://testnet.karwan.site/market');
  assert.equal(dealHref('/buyer?mode=direct', false), 'https://testnet.karwan.site/buyer?mode=direct');
});
