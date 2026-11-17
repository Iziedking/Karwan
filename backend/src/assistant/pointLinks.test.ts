import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNavigateAction, NAVIGATE_DESTINATIONS } from './actions.js';

/// Show me (view 57, 17 Nov): an answer to "where is it" opens the page with
/// that part lit. Page tours are gone, so no link starts one.

test('a point on its own page opens the page with the part lit, labelled Show me', () => {
  const built = buildNavigateAction({ destination: 'home', point: 'home-money' });
  assert.ok(!('error' in built));
  if (!('error' in built)) {
    assert.equal(built.href, '/app?point=home-money');
    assert.equal(built.label, 'Show me');
  }
});

test('a link that already has a query keeps it and adds the point', () => {
  const built = buildNavigateAction({ destination: 'deposit_address', point: 'bridge-address' });
  assert.ok(!('error' in built));
  if (!('error' in built)) assert.equal(built.href, '/bridge?direction=in&rail=direct&point=bridge-address');
});

test('a point on another page is refused and names the right page', () => {
  const built = buildNavigateAction({ destination: 'home', point: 'market-search' });
  assert.ok('error' in built);
  if ('error' in built) assert.match(built.error, /\/market/);
});

test('a point that is not on the list is refused', () => {
  assert.ok('error' in buildNavigateAction({ destination: 'home', point: 'not-a-point' }));
});

test('a point outside the plain charset is refused', () => {
  for (const point of ['Home_Money', 'a', 'x'.repeat(41), '../app', 'home-money&x=1']) {
    assert.ok('error' in buildNavigateAction({ destination: 'home', point }), point);
  }
});

test('no destination starts a page tour', () => {
  for (const gone of ['tour_home', 'tour_market', 'tour_money']) assert.ok(!(NAVIGATE_DESTINATIONS as readonly string[]).includes(gone));
  for (const destination of NAVIGATE_DESTINATIONS) {
    const built = buildNavigateAction({ destination, jobId: '0xabc', listingId: 'l1', token: '0f8e3b2a-1c4d-4e5f-9a6b-7c8d9e0f1a2b', address: `0x${'1'.repeat(40)}` });
    if (!('error' in built)) assert.ok(!built.href.includes('tour='), destination);
  }
});

test('a label the assistant gives still wins over Show me', () => {
  const built = buildNavigateAction({ destination: 'home', point: 'home-money', label: 'Add money here' });
  assert.ok(!('error' in built));
  if (!('error' in built)) assert.equal(built.label, 'Add money here');
});
