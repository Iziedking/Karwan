import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseLeg } from './payoutLeg.js';

const ESCROW = `0x${'55'.repeat(20)}`;
const SELLER_AGENT = `0x${'17'.repeat(20)}`;

test('a release names the address the escrow pays, so the arrival matches this payout', () => {
  const leg = releaseLeg({ buyerAgentWalletId: 'w-1', escrowTerms: { seller: SELLER_AGENT } }, ESCROW, 0, 9_950_000n);
  assert.deepEqual(leg, {
    key: 'release',
    label: 'Pay milestone 1',
    rail: 'circle_wallets',
    walletId: 'w-1',
    sourceAddress: ESCROW,
    destinationAddress: SELLER_AGENT,
    contractAddress: ESCROW,
    amountMicros: 9_950_000n,
  });
});

test('a deal with no stored escrow terms leaves the destination unset', () => {
  assert.equal(releaseLeg({ buyerAgentWalletId: 'w-1' }, ESCROW, 1, 1n).destinationAddress, undefined);
});
