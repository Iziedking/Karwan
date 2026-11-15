import assert from 'node:assert/strict';
import test from 'node:test';
import { backingRefusal, guaranteeMicros, guaranteeState } from './dealGuarantee.js';

/// A buyer's ask for a deal guarantee and where the seller stands (view 82).

const deal = (over: Record<string, unknown> = {}) => ({ dealAmountUsdc: '100', requireStake: true, requireStakePct: 50, ...over });

test('the guarantee is the asked share of the deal, in micros', () => {
  assert.equal(guaranteeMicros(100_000_000n, 50), 50_000_000n);
  assert.equal(guaranteeMicros(73_873_000n, 75), 55_404_750n);
  assert.equal(guaranteeMicros(1n, 50), 0n);
});

test('a deal with no ask needs nothing', () => {
  assert.deepEqual(guaranteeState(deal({ requireStake: false }), 0n), { state: 'none' });
});

test('an ask the pocket covers is asked, with what it needs', () => {
  assert.deepEqual(guaranteeState(deal(), 60_000_000n), { state: 'asked', needMicros: 50_000_000n });
});

test('an ask the pocket cannot cover says exactly what is missing', () => {
  assert.deepEqual(guaranteeState(deal({ requireStakePct: 100 }), 60_000_000n), { state: 'short', needMicros: 100_000_000n, missingMicros: 40_000_000n });
});

test('a backed ask stays backed whatever the pocket shows now', () => {
  assert.deepEqual(guaranteeState(deal({ guaranteeBackedAt: 1 }), 0n), { state: 'backed', needMicros: 50_000_000n });
});

test('an ask with no share set asks for half, as the escrow terms do', () => {
  assert.deepEqual(guaranteeState(deal({ requireStakePct: undefined }), 50_000_000n), { state: 'asked', needMicros: 50_000_000n });
});

test('agreeing to a deal with an ask needs the seller to back it, from a pocket that covers it', () => {
  assert.equal(backingRefusal(deal({ requireStake: false }), false, 0n), null);
  assert.equal(backingRefusal(deal(), false, 60_000_000n)?.code, 'GUARANTEE_NOT_CONFIRMED');
  const short = backingRefusal(deal(), true, 20_000_000n);
  assert.equal(short?.code, 'GUARANTEE_SHORT');
  assert.equal(short?.missingUsdc, '30');
  assert.equal(backingRefusal(deal(), true, 50_000_000n), null);
});
