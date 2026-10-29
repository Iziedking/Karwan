import assert from 'node:assert/strict';
import test from 'node:test';
import { homeBlock } from './homeBlock';

/// The first block on Home follows what a person said in setup (view 38).
///
///   npx tsx --test features/home/homeBlock.test.ts

const done = { setupDoneAt: 1 };

test('no setup yet: set up Karwan first, even after leaving mid-way', () => {
  assert.equal(homeBlock({ goals: ['work'], settings: {} }), 'setUp');
  assert.equal(homeBlock({}), 'setUp');
});

test('a seller with their own clients is shown how to get paid by them', () => {
  assert.equal(homeBlock({ goals: ['work'], agentPrefs: { findClients: false }, settings: done }), 'getPaid');
  assert.equal(homeBlock({ goals: ['sell'], settings: done }), 'getPaid');
});

test('a seller who wants clients found is shown matching work', () => {
  assert.equal(homeBlock({ goals: ['work'], agentPrefs: { findClients: true }, settings: done }), 'findWork');
});

test('someone who only buys is asked what they need', () => {
  assert.equal(homeBlock({ goals: ['buy'], settings: done }), 'postNeed');
});

test('anything else falls back to getting paid', () => {
  assert.equal(homeBlock({ goals: ['record'], settings: done }), 'getPaid');
  assert.equal(homeBlock({ goals: [], settings: done }), 'getPaid');
});
