import test from 'node:test';
import assert from 'node:assert/strict';
import { dropRoutedDeposits } from './activity.js';

/// The rule that decides how many rows one deposit is worth. It is tested apart
/// from the route because the failure it prevents is a money-visibility failure:
/// a user who deposits 20 USDC once and reads 40 USDC of deposits in their
/// history has no way to know which number is real.

const bridged = { kind: 'deposit', refId: 'deposit-tx-1', summary: 'from Base' };
const arcDirect = { kind: 'deposit', summary: 'straight onto Arc' };

test('a deposit that was routed on to Arc keeps only its bridge row', () => {
  const kept = dropRoutedDeposits([bridged], new Set(['deposit-tx-1']));
  assert.deepEqual(kept, []);
});

test('a deposit made straight onto Arc keeps its row', () => {
  // No hop exists for it, so nothing else in the history describes it. Dropping
  // this would make the deposit vanish entirely.
  const kept = dropRoutedDeposits([arcDirect], new Set(['deposit-tx-1']));
  assert.deepEqual(kept, [arcDirect]);
});

test('a deposit whose hop has no record yet keeps its row', () => {
  // Below the auto-bridge floor, or a chain the backend cannot sign for. The
  // money is sitting on the source chain and this row is the only thing that
  // says so.
  const kept = dropRoutedDeposits([bridged], new Set());
  assert.deepEqual(kept, [bridged]);
});

test('nothing but deposits is dropped', () => {
  // refId is also the Gateway transfer reference, so a payout or a pooled move
  // can carry a value that collides with a bridge id. Only deposits are the
  // movement a bridge row duplicates.
  const payout = { kind: 'payout', refId: 'deposit-tx-1' };
  const kept = dropRoutedDeposits([payout], new Set(['deposit-tx-1']));
  assert.deepEqual(kept, [payout]);
});
