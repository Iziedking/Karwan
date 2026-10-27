import assert from 'node:assert/strict';
import test from 'node:test';
import { onPreviousEscrow, withPreviousEscrow } from './previousEscrow.js';

test('once the family is live, every deal not on it is on the escrow from before', () => {
  assert.equal(onPreviousEscrow({}, true), true);
  assert.equal(onPreviousEscrow({ escrowVersion: 'v2' }, true), true);
  assert.equal(onPreviousEscrow({ escrowVersion: 'v3' }, true), true);
  assert.equal(onPreviousEscrow({ escrowVersion: 'suite' }, true), false);
});

test('before the family is live nothing is marked, so mainnet lists stay as they are', () => {
  assert.equal(onPreviousEscrow({}, false), false);
  assert.equal(onPreviousEscrow({ escrowVersion: 'v3' }, false), false);
});

test('the deal list marks only the deals from before', () => {
  const marked = withPreviousEscrow([{ jobId: 'a' }, { jobId: 'b', escrowVersion: 'suite' as const }], true);
  assert.deepEqual(marked, [{ jobId: 'a', previousEscrow: true }, { jobId: 'b', escrowVersion: 'suite' }]);
});
