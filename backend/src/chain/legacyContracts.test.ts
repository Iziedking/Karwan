import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { DEPLOY_LEDGER } from './deployLedger.js';
import { decodeLegacyEscrow, dealSteps, escrowVersionForWidth, olderContracts, vaultSteps, LEGACY_STATE } from './legacyContracts.js';

const LIVE_ESCROW = '0x0262a4dfec0e057caf80f124bfd2847581e82b63';
const BUYER = '0x00000000000000000000000000000000000000b1';
const SELLER = '0x00000000000000000000000000000000000000c2';

test('every older escrow and every vault on the network is listed, the live escrow is not', () => {
  const { escrows, vaults } = olderContracts(DEPLOY_LEDGER, { escrow: LIVE_ESCROW });
  assert.ok(!escrows.includes(LIVE_ESCROW));
  for (const a of ['0xe796bcdbdbfd01a8a01d640e0d3fecd21b127f95', '0x9ed65f925baf6b1d794a10cfddfae4e56cc4e5f8', '0x534dccfad1924fca46ea30dee5591fa3d96137b3', '0x48797c04ee342067a68f29fbb19b577077d77301']) {
    assert.ok(escrows.includes(a), a);
  }
  // The previous vault (the live one until the guarantee moves) is on the page too.
  for (const a of ['0x92b1223921944024f6615a604a2bda6ef1fee922', '0x3fe7bddea2b1d5255a0e865222dae00eeefc45da', '0xab26eb7c8462f26a03a9bf32a6e662faee64368e', '0x2d4506284b2d778365b4b295100ef099f35973c5', '0xa600bd772a032ec2b96a9a44545024e270418927']) {
    assert.ok(vaults.includes(a), a);
  }
});

test('the escrow version is read from the width of its deal record', () => {
  assert.equal(escrowVersionForWidth(6), 'v0');
  assert.equal(escrowVersionForWidth(9), 'pre-v2d');
  assert.equal(escrowVersionForWidth(10), 'v2d');
  assert.equal(escrowVersionForWidth(11), 'v2e');
  assert.equal(escrowVersionForWidth(7), null);
});

test('each version decodes to the same deal, in one state language', () => {
  const v0 = encodeAbiParameters(parseAbiParameters('address,address,uint256,uint256,uint8,uint8'), [BUYER, SELLER, 20_700_000n, 0n, 0, 1]);
  assert.deepEqual(decodeLegacyEscrow('v0', v0), { buyer: BUYER, seller: SELLER, lockedMicros: 20_700_000n, state: LEGACY_STATE.Funded });
  const pre = encodeAbiParameters(parseAbiParameters('address,address,uint256,uint256,uint256,uint256,uint256,uint8,uint8'), [BUYER, SELLER, 10_000_000n, 9_950_000n, 50_000n, 2_000_000n, 10_000n, 1, 3]);
  assert.deepEqual(decodeLegacyEscrow('pre-v2d', pre), { buyer: BUYER, seller: SELLER, lockedMicros: 8_000_000n, state: LEGACY_STATE.Disputed });
  // v2.D adds Accepted after Funded: 2 is Accepted, which is still funded.
  const v2d = encodeAbiParameters(parseAbiParameters('address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8'), [BUYER, SELLER, 10_000_000n, 9_950_000n, 50_000n, 0n, 0n, 0n, 0, 2]);
  assert.equal(decodeLegacyEscrow('v2d', v2d)!.state, LEGACY_STATE.Funded);
  const v2e = encodeAbiParameters(parseAbiParameters('address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,uint16'), [BUYER, SELLER, 10_000_000n, 9_950_000n, 50_000n, 0n, 0n, 0n, 0, 3, 0]);
  assert.equal(decodeLegacyEscrow('v2e', v2e)!.state, LEGACY_STATE.Settled);
});

test('an empty record decodes to nothing', () => {
  const empty = encodeAbiParameters(parseAbiParameters('address,address,uint256,uint256,uint8,uint8'), ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', 0n, 0n, 0, 0]);
  assert.equal(decodeLegacyEscrow('v0', empty), null);
});

test('a guarantee on an older vault offers the step its state allows', () => {
  const now = 1_800_000_000;
  assert.deepEqual(vaultSteps({ state: 1, claimableAt: 0 }, now), ['requestWithdraw']);
  assert.deepEqual(vaultSteps({ state: 2, claimableAt: now + 60 }, now), ['cancelWithdraw']);
  assert.deepEqual(vaultSteps({ state: 2, claimableAt: now }, now), ['claim', 'cancelWithdraw']);
  assert.deepEqual(vaultSteps({ state: 3, claimableAt: now }, now), []);
});

test('an older deal offers the buyer a release or their money back, and the seller nothing to sign', () => {
  const deal = { buyer: BUYER, seller: SELLER, lockedMicros: 5n, state: LEGACY_STATE.Funded };
  assert.deepEqual(dealSteps(deal, 'buyer'), ['releaseFinal', 'refund']);
  assert.deepEqual(dealSteps({ ...deal, state: LEGACY_STATE.Disputed }, 'buyer'), ['refund']);
  assert.deepEqual(dealSteps(deal, 'seller'), []);
  assert.deepEqual(dealSteps({ ...deal, lockedMicros: 0n }, 'buyer'), []);
  assert.deepEqual(dealSteps({ ...deal, state: LEGACY_STATE.Settled }, 'buyer'), []);
});
