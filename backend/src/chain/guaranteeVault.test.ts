import assert from 'node:assert/strict';
import test from 'node:test';
import { guaranteeState } from './guaranteeVault.js';

const USDC = 1_000_000n;
const NOW = 1_800_000_000;

test('nothing put up reads as zero everywhere', () => {
  assert.deepEqual(guaranteeState({ active: 0n, reserved: 0n, cooling: 0n, coolUntil: 0n }, 0n, NOW), {
    inPlaceMicros: 0n,
    heldMicros: 0n,
    freeMicros: 0n,
    comingBackMicros: 0n,
    readyAt: null,
    ready: false,
  });
});

test('what deals hold and what is coming back are counted inside the guarantee', () => {
  const s = guaranteeState({ active: 100n * USDC, reserved: 40n * USDC, cooling: 20n * USDC, coolUntil: BigInt(NOW + 86_400) }, 40n * USDC, NOW);
  assert.equal(s.inPlaceMicros, 80n * USDC);
  assert.equal(s.heldMicros, 40n * USDC);
  assert.equal(s.freeMicros, 40n * USDC);
  assert.equal(s.comingBackMicros, 20n * USDC);
  assert.equal(s.readyAt, NOW + 86_400);
  assert.equal(s.ready, false);
});

test('money coming back is ready once its date has passed', () => {
  const s = guaranteeState({ active: 20n * USDC, reserved: 0n, cooling: 20n * USDC, coolUntil: BigInt(NOW) }, 0n, NOW);
  assert.equal(s.inPlaceMicros, 0n);
  assert.equal(s.comingBackMicros, 20n * USDC);
  assert.equal(s.ready, true);
});
