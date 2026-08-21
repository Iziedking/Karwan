import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinancingParty, tradeChannelDecision, type TradeChannelDeal } from './channelAccess.js';

const JOB = '0xabc';
const BUYER = '0x1111111111111111111111111111111111111111';
const SELLER = '0xb16e000000000000000000000000000000005858';
const STRANGER = '0x9999999999999999999999999999999999999999';
const ZERO = '0x0000000000000000000000000000000000000000';

function deal(over: Partial<TradeChannelDeal> = {}): TradeChannelDeal {
  return { buyer: BUYER, seller: SELLER, ...over };
}

test('only the seller and financier can access a financing position', () => {
  assert.equal(isFinancingParty('0xSeller', '0xseller', '0xfinancier'), true);
  assert.equal(isFinancingParty('0xFinancier', '0xseller', '0xfinancier'), true);
  assert.equal(isFinancingParty('0xBuyer', '0xseller', '0xfinancier'), false);
  assert.equal(isFinancingParty('0xUnrelated', '0xseller', '0xfinancier'), false);
});

test('both parties can talk as soon as the deal names them', () => {
  // The bug this covers: the channel required `acceptedAt`, which means the
  // escrow is funded and Accepted on chain. So a buyer who had named a seller
  // was told "only the buyer or seller of this deal can post to its chat" while
  // being the buyer, and had no way to reach acceptance.
  const open = { allowed: true, writable: true, jobId: JOB, channelKey: JOB };
  assert.deepEqual(tradeChannelDecision(JOB, deal(), BUYER), { ...open, recipient: SELLER });
  assert.deepEqual(tradeChannelDecision(JOB, deal(), SELLER), { ...open, recipient: BUYER });
});

test('a stranger gets nothing, whatever the deal state', () => {
  assert.deepEqual(tradeChannelDecision(JOB, deal(), STRANGER), {
    allowed: false,
    writable: false,
  });
  assert.deepEqual(tradeChannelDecision(JOB, deal({ settledAt: 5 }), STRANGER), {
    allowed: false,
    writable: false,
  });
});

test('a caller in the wrong case is still a party', () => {
  assert.equal(tradeChannelDecision(JOB, deal(), BUYER.toUpperCase()).allowed, true);
  assert.equal(
    tradeChannelDecision(JOB, { buyer: BUYER.toUpperCase(), seller: SELLER }, BUYER).allowed,
    true,
  );
});

test('an unclaimed email invite has nobody on the other end', () => {
  assert.deepEqual(tradeChannelDecision(JOB, deal({ seller: ZERO }), BUYER), {
    allowed: false,
    writable: false,
  });
  assert.deepEqual(tradeChannelDecision(JOB, deal({ seller: '' }), BUYER), {
    allowed: false,
    writable: false,
  });
});

test('a closed deal is readable and not writable', () => {
  const settled = tradeChannelDecision(JOB, deal({ settledAt: 1_700 }), BUYER);
  assert.equal(settled.allowed, true);
  assert.equal(settled.writable, false);
  assert.equal(settled.closedReason, 'settled');
  assert.equal(settled.closedAt, 1_700);

  const cancelled = tradeChannelDecision(JOB, deal({ cancelledAt: 42 }), SELLER);
  assert.equal(cancelled.writable, false);
  assert.equal(cancelled.closedReason, 'cancelled');
});

test('settled wins over cancelled when a deal somehow carries both', () => {
  const both = tradeChannelDecision(JOB, deal({ settledAt: 9, cancelledAt: 10 }), BUYER);
  assert.equal(both.closedReason, 'settled');
});

test('no deal, no channel', () => {
  assert.deepEqual(tradeChannelDecision(JOB, null, BUYER), { allowed: false, writable: false });
  assert.deepEqual(tradeChannelDecision(JOB, undefined, BUYER), { allowed: false, writable: false });
});
