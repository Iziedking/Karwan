import assert from 'node:assert/strict';
import test from 'node:test';
import {
  elapsedParts,
  isTakingLong,
  outAvailable,
  planOut,
  planTopUp,
  poolOutcome,
  routeSpeed,
  stepForMovementState,
  stepForPhase,
  transferView,
  walletSources,
} from './routePlan';

test('a top-up draws on the Arc balance first, then an existing Gateway balance, never both', () => {
  assert.deepEqual(planTopUp({ amount: 50, balance: 100, pool: 500 }), { kind: 'balance' });
  assert.deepEqual(planTopUp({ amount: 300, balance: 100, pool: 500 }), { kind: 'pool' });
  assert.deepEqual(planTopUp({ amount: 600, balance: 100, pool: 500 }), { kind: 'short', shortfall: 100 });
  assert.deepEqual(planTopUp({ amount: 150, balance: 100, pool: 100 }), { kind: 'short', shortfall: 50 });
});

test('a move off Arc uses the Gateway balance only when it covers the whole amount and reaches the destination', () => {
  assert.deepEqual(planOut({ amount: 50, destination: 'baseSepolia', balance: 100, pool: 60 }), { kind: 'pool' });
  assert.deepEqual(planOut({ amount: 80, destination: 'baseSepolia', balance: 100, pool: 60 }), { kind: 'cctp' });
  assert.deepEqual(planOut({ amount: 50, destination: 'avalancheFuji', balance: 100, pool: 60 }), { kind: 'cctp' });
  assert.deepEqual(planOut({ amount: 150, destination: 'baseSepolia', balance: 100, pool: 60 }), { kind: 'short', shortfall: 50 });
  assert.deepEqual(planOut({ amount: 150, destination: 'avalancheFuji', balance: 100, pool: 140 }), { kind: 'short', shortfall: 50 });
});

test('what a move can take depends on whether Gateway reaches the destination', () => {
  assert.equal(outAvailable('baseSepolia', 100, 140), 140);
  assert.equal(outAvailable('avalancheFuji', 100, 140), 100);
});

test('every pipeline phase maps to a step, and no wait maps to failure', () => {
  assert.equal(stepForPhase('switching'), 'signed');
  assert.equal(stepForPhase('approving'), 'signed');
  assert.equal(stepForPhase('burning'), 'signed');
  assert.equal(stepForPhase('relaying'), 'leaving');
  assert.equal(stepForPhase('attesting'), 'leaving');
  assert.equal(stepForPhase('minting'), 'arriving');
  assert.equal(stepForPhase('done'), 'arrived');
  assert.equal(stepForPhase('error'), 'failed');
});

test('a Gateway cash-out steps by its movement state, and needing attention is still a wait', () => {
  assert.equal(stepForMovementState('created'), 'signed');
  assert.equal(stepForMovementState('preparing'), 'signed');
  assert.equal(stepForMovementState('submitted'), 'arriving');
  assert.equal(stepForMovementState('verifying'), 'arriving');
  assert.equal(stepForMovementState('needs_attention'), 'arriving');
  assert.equal(stepForMovementState('completed'), 'arrived');
  assert.equal(stepForMovementState('cancelled'), 'failed');
});

test('timing comes from the route, and slow means past the usual', () => {
  assert.equal(routeSpeed('arc'), 'seconds');
  assert.equal(routeSpeed('pool'), 'seconds');
  assert.equal(routeSpeed('cctpIn'), 'underMinute');
  assert.equal(routeSpeed('cctpOut'), 'underMinute');
  assert.equal(isTakingLong(0, 59_000, 'seconds'), false);
  assert.equal(isTakingLong(0, 61_000, 'seconds'), true);
  assert.equal(isTakingLong(0, 4 * 60_000, 'underMinute'), false);
  assert.equal(isTakingLong(0, 6 * 60_000, 'underMinute'), true);
});

test('elapsed time splits into minutes and seconds', () => {
  assert.deepEqual(elapsedParts(0), { m: 0, s: 0 });
  assert.deepEqual(elapsedParts(59_900), { m: 0, s: 59 });
  assert.deepEqual(elapsedParts(125_000), { m: 2, s: 5 });
});

test('wallet sources list chains holding USDC, most first, and drop failed reads', () => {
  const keys = ['sepolia', 'baseSepolia', 'polygonAmoy', 'arbitrumSepolia'] as const;
  const results = [
    { status: 'success' as const, result: 5_000_000n },
    { status: 'success' as const, result: 250_000_000n },
    { status: 'failure' as const },
    { status: 'success' as const, result: 0n },
  ];
  assert.deepEqual(walletSources(keys, results), [
    { key: 'baseSepolia', amount: 250 },
    { key: 'sepolia', amount: 5 },
  ]);
});

test('a failure after the money left the source reads as on its way, never as failed', () => {
  assert.deepEqual(transferView('arrived', false), { kind: 'arrived' });
  assert.deepEqual(transferView('failed', true), { kind: 'stuck' });
  assert.deepEqual(transferView('failed', false), { kind: 'failed' });
  assert.deepEqual(transferView('leaving', false), { kind: 'moving', step: 'leaving' });
});

test('a Gateway cash-out answer maps to a step; a refusal fails, anything unclear waits', () => {
  assert.deepEqual(poolOutcome({ movementState: 'completed' }), { step: 'arrived', leftSource: true });
  assert.deepEqual(poolOutcome({ movementState: 'verifying' }), { step: 'arriving', leftSource: true });
  assert.deepEqual(poolOutcome({ status: 400, reference: null }), { step: 'failed', leftSource: false });
  assert.deepEqual(poolOutcome({ status: 409, reference: null }), { step: 'failed', leftSource: true });
  assert.deepEqual(poolOutcome({ status: 502, reference: 'KRW-1' }), { step: 'failed', leftSource: true });
  assert.deepEqual(poolOutcome({ status: null, reference: null }), { step: 'failed', leftSource: true });
});
