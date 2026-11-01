import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelBlock, reopensOnEdit, sellersToJudgeAgain } from './noDeal.js';

const open = { escrowFunded: false, finalized: false };

test('an open request cancels', () => {
  assert.equal(cancelBlock(open), null);
});

test('a request whose search ended without a deal cancels', () => {
  assert.equal(cancelBlock({ ...open, finalized: true, negotiationEndedAt: 1 }), null);
});

test('a pending match blocks the cancel', () => {
  assert.equal(cancelBlock({ ...open, finalized: true })?.code, 'ALREADY_MATCHED');
});

test('a funded deal or a closed request blocks the cancel', () => {
  assert.equal(cancelBlock({ ...open, escrowFunded: true, finalized: true, negotiationEndedAt: 1 })?.code, 'ESCROW_FUNDED');
  assert.equal(cancelBlock({ ...open, expired: true, negotiationEndedAt: 1 })?.code, 'ALREADY_TERMINAL');
});

test('an edit reopens only a search that ended without a deal on an open request', () => {
  assert.equal(reopensOnEdit({ negotiationEndedAt: 1, escrowFunded: false }), true);
  assert.equal(reopensOnEdit({ escrowFunded: false }), false);
  assert.equal(reopensOnEdit({ negotiationEndedAt: 1, escrowFunded: true }), false);
  assert.equal(reopensOnEdit({ negotiationEndedAt: 1, escrowFunded: false, expired: true }), false);
});

test('sellers the agent gave up on are judged again while their offer is held', () => {
  const tried = new Set(['0xa', '0xb', '0xwithdrew']);
  assert.deepEqual(sellersToJudgeAgain(tried, ['0xa', '0xb', '0xc']), ['0xa', '0xb']);
});
