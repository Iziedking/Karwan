import assert from 'node:assert/strict';
import test from 'node:test';
import { bringFrom } from './bringItHere';

/// B-06, owner, 15 Nov 2026: Bring it here moves money in place, from the right agent.

test('what is missing comes from the agent holding more, rounded up to the cent', () => {
  assert.deepEqual(bringFrom({ buyer: 3, seller: 40 }, 12.341), { agent: 'seller', amount: 12.35 });
  assert.deepEqual(bringFrom({ buyer: 40, seller: 3 }, 12), { agent: 'buyer', amount: 12 });
});

test('it never asks for more than that agent holds', () => {
  assert.deepEqual(bringFrom({ buyer: 5.5, seller: 2 }, 9), { agent: 'buyer', amount: 5.5 });
});

test('with nothing in particular missing it brings all that agent holds', () => {
  assert.deepEqual(bringFrom({ buyer: 0, seller: 7.1234567 }), { agent: 'seller', amount: 7.123456 });
});

test('with nothing at the agents there is nothing to bring', () => {
  assert.equal(bringFrom({ buyer: 0, seller: null }, 10), null);
  assert.equal(bringFrom({ buyer: null, seller: null }), null);
});

test('an exact figure in cents is not pushed up a cent', () => {
  assert.deepEqual(bringFrom({ buyer: 50, seller: 0 }, 0.29), { agent: 'buyer', amount: 0.29 });
});
