import assert from 'node:assert/strict';
import test from 'node:test';
import { gatewayDepositUsd, usdcUnitsToUsd } from './gatewayDeposit.js';

test('an agent with nothing in its wallet sends nothing and works on free data (B-09, owner, 15 Nov 2026)', () => {
  assert.equal(gatewayDepositUsd(0.021, 0, 0.1), null);
  assert.equal(gatewayDepositUsd(0.021, 0.02, 0.1), null);
});

test('an agent tops up the usual amount when it holds it, and only what it holds when it holds less', () => {
  assert.equal(gatewayDepositUsd(0.021, 5, 0.1), 0.1);
  assert.equal(gatewayDepositUsd(0.021, 0.05, 0.1), 0.05);
  assert.equal(gatewayDepositUsd(0.25, 5, 0.1), 0.25);
  assert.equal(gatewayDepositUsd(0.021, 0.021, 0.1), 0.021);
});

test('base units read as dollars', () => {
  assert.equal(usdcUnitsToUsd(100_000n), 0.1);
  assert.equal(usdcUnitsToUsd(0n), 0);
});
