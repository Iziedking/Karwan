import assert from 'node:assert/strict';
import test from 'node:test';
import { firstPost } from './firstPost.js';

///   npx tsx --test src/agents/firstPost.test.ts

test('a seller who said what they do is offered an offer', () => {
  assert.deepEqual(firstPost({ goals: ['work'], what: 'Logo design', price: '20 to 40 USDC' }), {
    kind: 'offer',
    handOff: 'I sell: Logo design. Usually 20 to 40 USDC. Post this as my offer.',
  });
});

test('a buyer who said what they need is offered a request', () => {
  assert.deepEqual(firstPost({ goals: ['buy'], buy: 'A tailor' }), {
    kind: 'request',
    handOff: 'I need: A tailor. Post this as my request.',
  });
});

test('nothing to post when they skipped what they do', () => {
  assert.equal(firstPost({ goals: ['work'] }), null);
});

test('nothing to post for a record-only account', () => {
  assert.equal(firstPost({ goals: ['record'] }), null);
});
