import assert from 'node:assert/strict';
import test from 'node:test';
import { GUARANTEE_SHARES, guaranteeTerm, guaranteeUsdc } from './guaranteeAsk';

/// A buyer's ask for a deal guarantee, as each side reads it (view 82).

test('the guarantee is the asked share of the deal', () => {
  assert.equal(guaranteeUsdc(47.186, 50), 23.593);
  assert.equal(guaranteeUsdc(100, 75), 75);
  assert.deepEqual(GUARANTEE_SHARES, [50, 75, 100]);
});

test('a deal with no ask shows no guarantee', () => {
  assert.equal(guaranteeTerm({ dealAmountUsdc: '100', requireStake: false }), null);
});

test('an ask reads asked until the seller backs it, then backed', () => {
  assert.deepEqual(guaranteeTerm({ dealAmountUsdc: '100', requireStake: true, requireStakePct: 50 }), { usdc: 50, pct: 50, backed: false });
  assert.deepEqual(guaranteeTerm({ dealAmountUsdc: '100', requireStake: true, requireStakePct: 50, guaranteeBackedAt: 1 }), { usdc: 50, pct: 50, backed: true });
});

test('a paid-in deal with an ask counts as backed: the escrow reserved it when it was accepted', () => {
  assert.equal(guaranteeTerm({ dealAmountUsdc: '100', requireStake: true, acceptedAt: 5 })?.backed, true);
});

test('an ask with no share set asks for half', () => {
  assert.equal(guaranteeTerm({ dealAmountUsdc: '80', requireStake: true })?.usdc, 40);
});
