import assert from 'node:assert/strict';
import test from 'node:test';
import { circleFeeEstimator } from './fees';

test("fees come from Circle's own price, which its bundler accepts", async () => {
  const estimate = circleFeeEstimator(async () => ({
    low: { maxFeePerGas: '41500000000', maxPriorityFeePerGas: '1500000000' },
    medium: { maxFeePerGas: '42250000000', maxPriorityFeePerGas: '2250000000' },
    high: { maxFeePerGas: '45709000000', maxPriorityFeePerGas: '5709000000' },
  }));
  assert.deepEqual(await estimate(), { maxFeePerGas: 42_250_000_000n, maxPriorityFeePerGas: 2_250_000_000n });
});
