import assert from 'node:assert/strict';
import test from 'node:test';
import { tourOffer, tourPage } from './tourOffer';

/// The page tour is offered, never forced (view 57, 15 Nov evening).

const base = { newcomer: true, offerOff: false, pathname: '/app', tourSeen: false, hasTour: true };

test('the tour is offered on Home, Market, a deal and Money only', () => {
  assert.equal(tourPage('/app'), 'home');
  assert.equal(tourPage('/market'), 'market');
  assert.equal(tourPage('/deals/0xabc'), 'deal');
  assert.equal(tourPage('/account'), 'money');
  assert.equal(tourPage('/account/agent'), null);
  assert.equal(tourPage('/send'), null);
  assert.equal(tourPage('/deals'), null);
});

test('only someone new is offered it, once per page tour, and never after Not now', () => {
  assert.equal(tourOffer(base), true);
  assert.equal(tourOffer({ ...base, newcomer: false }), false);
  assert.equal(tourOffer({ ...base, tourSeen: true }), false);
  assert.equal(tourOffer({ ...base, offerOff: true }), false);
  assert.equal(tourOffer({ ...base, hasTour: false }), false);
  assert.equal(tourOffer({ ...base, pathname: '/profile' }), false);
});
