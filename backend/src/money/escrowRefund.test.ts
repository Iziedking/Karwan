import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { escrowBuyerRefundMicros, remainingEscrowMicros } from './escrowRefund.js';

test('remaining escrow is the contract balance after released milestones', () => {
  assert.equal(remainingEscrowMicros(1_000_000n, 250_000n), 750_000n);
});

test('remaining escrow rejects impossible released totals', () => {
  assert.throws(
    () => remainingEscrowMicros('1000000', '1000001'),
    /ESCROW_RELEASED_EXCEEDS_DEAL_AMOUNT/,
  );
});

test('a refund receipt carries the fee the buyer paid, as the escrow pays it', () => {
  // Deal 0xe907 on Arc Testnet: 121.73 USDC, fees 0.75% from each side.
  const account = { sellerNet: 120_817_025n, released: 0n, feeTotal: 1_825_950n, feeReleased: 0n };
  assert.equal(escrowBuyerRefundMicros(account), 122_642_975n);
  assert.throws(
    () => escrowBuyerRefundMicros({ ...account, released: 120_817_026n, feeReleased: 1_825_950n }),
    /ESCROW_RELEASED_EXCEEDS_DEAL_AMOUNT/,
  );
});

test('the watcher reclaims a missed deadline on an escrow the seller never accepted', () => {
  const watcher = readFileSync(new URL('../agents/dealWatcher.ts', import.meta.url), 'utf8');
  assert.match(
    watcher,
    /account\.state === ESCROW_FUNDED && !dealEscrowOps\.isV3\(deal\)\) \{\s*await maybeReclaimAfterDeadline\(deal, account, now\);/,
  );
  assert.match(watcher, /const onChainReclaim = dealEscrowOps\.usesOnChainClock\(deal\) && account\.state === ESCROW_ACCEPTED;/);
  assert.match(watcher, /if \(account\.state !== ESCROW_DISPUTED\) \{\s*await disputeEscrow\(deal\.jobId, buyerWalletId, reason\);/);
});
