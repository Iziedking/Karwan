import assert from 'node:assert/strict';
import test from 'node:test';
import { smoothScrollAllowed } from './smoothScroll.js';

function win({ fine = true, reduced = false, snap = false } = {}) {
  return {
    matchMedia: (q: string) => ({ matches: q.includes('reduced-motion') ? reduced : fine }) as MediaQueryList,
    document: { documentElement: { classList: { contains: (c: string) => snap && c === 'lp-snap' } } },
  };
}

test('the page glides on a desktop pointer, on product pages', () => {
  assert.equal(smoothScrollAllowed('/market', win()), true);
  assert.equal(smoothScrollAllowed('/credit-passport/0x1', win()), true);
});

test('never on a phone, never with reduced motion, never on the landing page or the console', () => {
  assert.equal(smoothScrollAllowed('/market', win({ fine: false })), false);
  assert.equal(smoothScrollAllowed('/market', win({ reduced: true })), false);
  assert.equal(smoothScrollAllowed('/', win()), false);
  assert.equal(smoothScrollAllowed('/how-it-works', win({ snap: true })), false);
  assert.equal(smoothScrollAllowed('/admin/waitlist', win()), false);
  assert.equal(smoothScrollAllowed(null, win()), false);
});
