import assert from 'node:assert/strict';
import test from 'node:test';
import { readEscrowFeeBps } from './escrowFee.js';

test('new deals funded on the v3 escrow take its fee', async () => {
  const fee = await readEscrowFeeBps({ v3Funding: true, readV3: async () => 150n, readLegacy: async () => { throw new Error('legacy is not deployed'); } });
  assert.equal(fee, 150);
});

test('without v3 funding the legacy escrow fee is used', async () => {
  const fee = await readEscrowFeeBps({ v3Funding: false, readV3: async () => 150n, readLegacy: async () => 100n });
  assert.equal(fee, 100);
});
