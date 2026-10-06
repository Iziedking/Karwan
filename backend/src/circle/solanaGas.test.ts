import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureSolanaGas } from './solanaGas.js';

const NEED = 3_000_000;

function deps(readings: Array<number | null>, dripOk = true) {
  const drips: string[] = [];
  let i = 0;
  return {
    drips,
    deps: {
      readLamports: async () => readings[Math.min(i++, readings.length - 1)] ?? null,
      drip: async (address: string) => {
        drips.push(address);
        return { ok: dripOk };
      },
      sleep: async () => {},
      minLamports: NEED,
      attempts: 4,
    },
  };
}

test('a wallet that already holds SOL is left alone', async () => {
  const { deps: d, drips } = deps([NEED]);
  assert.equal(await ensureSolanaGas('So1', d), true);
  assert.deepEqual(drips, []);
});

test('an empty wallet is given SOL and used once it lands', async () => {
  const { deps: d, drips } = deps([0, 0, NEED]);
  assert.equal(await ensureSolanaGas('So1', d), true);
  assert.deepEqual(drips, ['So1']);
});

test('SOL that never lands is reported, not bridged into a failure', async () => {
  const { deps: d } = deps([0]);
  assert.equal(await ensureSolanaGas('So1', d), false);
});

test('a refused drip stops at once', async () => {
  const { deps: d } = deps([0], false);
  assert.equal(await ensureSolanaGas('So1', d), false);
});
