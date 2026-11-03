import assert from 'node:assert/strict';
import test from 'node:test';
import { routeMotion } from './routeMotion';

/// How a new page arrives (view 48): forward pushes in from the end side, back
/// reverses, a tab fades, and the first page of a visit paints still.

test('the first page of a visit does not move', () => {
  assert.equal(routeMotion(null, '/app', false), 'none');
});

test('opening something from a page pushes forward', () => {
  assert.equal(routeMotion('/app', '/deals/0xabc', false), 'forward');
  assert.equal(routeMotion('/market', '/listings/abc', false), 'forward');
  assert.equal(routeMotion('/listings/abc', '/order/abc', false), 'forward');
});

test('going back reverses, even onto a tab', () => {
  assert.equal(routeMotion('/deals/0xabc', '/deals', true), 'back');
  assert.equal(routeMotion('/order/abc', '/listings/abc', true), 'back');
});

test('moving between tabs fades', () => {
  for (const [from, to] of [['/app', '/market'], ['/market', '/deals'], ['/deals/0xabc', '/profile'], ['/profile', '/account']]) {
    assert.equal(routeMotion(from, to, false), 'fade', `${from} -> ${to}`);
  }
});

test('the same page again does not move', () => {
  assert.equal(routeMotion('/deals', '/deals', false), 'none');
});
