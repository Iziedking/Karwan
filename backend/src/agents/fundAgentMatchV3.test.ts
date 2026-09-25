import assert from 'node:assert/strict';
import test from 'node:test';
import { createDealEscrowV3, DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { DealTermsLimits } from '../chain/dealTermsV3.js';
import { fundingSaltV3 } from '../deals/fundDirectV3.js';
import { fundAgentMatchV3, type FundAgentMatchV3Deps, type FundAgentMatchV3Input } from './fundAgentMatchV3.js';

type Hex = `0x${string}`;

const ESCROW = `0x${'11'.repeat(20)}` as Hex;
const BUYER_AGENT = `0x${'22'.repeat(20)}` as Hex;
const SELLER_AGENT = `0x${'33'.repeat(20)}` as Hex;
const JOB = `0x${'aa'.repeat(32)}` as Hex;
const NOW_MS = 1_800_000_000_000;
const DAY = 86_400;

const LIMITS: DealTermsLimits = {
  nowSecs: NOW_MS / 1000,
  minReviewSecs: 60,
  maxReviewSecs: 180 * DAY,
  maxHorizonSecs: 730 * DAY,
  highValueUnits: 0n,
  baseReviewSecs: 300,
  reclaimGraceSecs: DAY,
};

function blank(): DealV3View {
  const z = `0x${'00'.repeat(20)}` as Hex;
  return {
    state: DEAL_STATE.None, buyer: z, seller: z, buyerId: z, sellerId: z, count: 0, paid: 0, extUsed: 0,
    revision: 0, checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false,
    deliveredAt: 0n, reviewStartAt: 0n, reviewEnd: 0n, deadline: 0n, disputedAt: 0n, proposedAt: 0n,
    proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n, feeReleased: 0n, reserved: 0n,
    termsHash: `0x${'00'.repeat(32)}`,
  };
}

function world() {
  const chain = new Map<string, DealV3View>();
  const receipts = new Map<string, Array<{ name: string; jobId: Hex; args: Record<string, unknown> }>>();
  const calls: string[] = [];
  const plan: Array<'ok' | 'revert'> = [];
  let tx = 0;
  let allowance = 0n;
  const escrow = createDealEscrowV3({
    address: ESCROW,
    chainId: 5042002,
    async execute(input) {
      const hash = `0x${(++tx).toString(16).padStart(64, '0')}`;
      const name = input.abiFunctionSignature.split('(')[0];
      calls.push(name);
      if ((plan.shift() ?? 'ok') === 'revert') return { txHash: hash };
      if (name === 'fund') {
        const [salt, terms] = input.abiParameters as [Hex, unknown[]];
        const id = escrow.dealIdFor(BUYER_AGENT, salt);
        const { dealTermsHash } = await import('../chain/dealTermsV3.js');
        const t = terms as string[];
        const revived = {
          seller: t[0], amount: BigInt(t[1]), pcts: (t[2] as unknown as string[]).map(Number),
          reservationBps: Number(t[3]), deliveryDeadline: BigInt(t[4]), reclaimGrace: Number(t[5]),
          reviewWindow: Number(t[6]), reviewStarts: Number(t[7]), startLongstop: Number(t[8]),
          maxExtensions: Number(t[9]), extensionSecs: Number(t[10]), finalRelease: Number(t[11]),
          silenceOutcome: Number(t[12]), silentLongstop: Number(t[13]), checkPolicy: t[14], agreementHash: t[15],
        } as Parameters<typeof dealTermsHash>[0];
        const h = dealTermsHash(revived);
        chain.set(id, { ...blank(), state: DEAL_STATE.Funded, buyer: BUYER_AGENT, seller: SELLER_AGENT, termsHash: h });
        receipts.set(hash, [{ name: 'DealFunded', jobId: id, args: { buyer: BUYER_AGENT, termsHash: h } }]);
      } else if (name === 'accept') {
        const id = (input.abiParameters as [Hex])[0];
        chain.set(id, { ...chain.get(id)!, state: DEAL_STATE.Accepted });
      }
      return { txHash: hash };
    },
    readDeal: async (id) => chain.get(id) ?? blank(),
    readOwed: async () => 0n,
    readSplit: async () => ({ active: false, sellerBps: 0 }),
    readHeld: async () => false,
    receiptEvents: async (h) => receipts.get(h) ?? [],
    emit: () => undefined,
  });
  const deps: FundAgentMatchV3Deps = {
    escrow,
    readDeal: async (id) => chain.get(id) ?? blank(),
    readLimits: async () => LIMITS,
    readFeeBps: async () => 150,
    readUsdcAllowance: async () => allowance,
    async approveUsdc(i) {
      calls.push('approve');
      allowance = i.amount;
    },
    now: () => NOW_MS,
  };
  return { deps, chain, calls, plan };
}

function input(over: Partial<FundAgentMatchV3Input> = {}): FundAgentMatchV3Input {
  return {
    jobId: JOB,
    buyerAgent: { walletId: 'buyer-w', address: BUYER_AGENT },
    sellerAgent: { walletId: 'seller-w', address: SELLER_AGENT },
    priceUnits: 200_000_000n,
    milestonePcts: [50, 50],
    trustedMatch: false,
    deadlineUnix: NOW_MS / 1000 + 5 * DAY,
    tradeType: 'service',
    agreementHash: `0x${'cd'.repeat(32)}`,
    ...over,
  };
}

test('funds with the full terms, then the seller agent accepts the same hash', async () => {
  const w = world();
  const r = await fundAgentMatchV3(w.deps, input());
  assert.equal(r.ok, true);
  assert.deepEqual(w.calls, ['approve', 'fund', 'accept']);
  if (!r.ok) return;
  assert.equal(r.record.escrowVersion, 'v3');
  assert.equal(r.record.escrowDealId, w.deps.escrow.dealIdFor(BUYER_AGENT, fundingSaltV3(JOB)));
  assert.equal(r.accepted, true);
});

test('a fund Circle reports but the chain never shows is not treated as funded', async () => {
  const w = world();
  w.plan.push('revert');
  const r = await fundAgentMatchV3(w.deps, input());
  assert.deepEqual(r, { ok: false, reason: 'FUND_NOT_CONFIRMED' });
});

test('funded but the seller accept did not land: still funded, accept is retried at delivery', async () => {
  const w = world();
  w.plan.push('ok', 'revert');
  const r = await fundAgentMatchV3(w.deps, input());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.accepted, false);
});

test('a retry after a crash finds the funded deal and does not pay twice', async () => {
  const w = world();
  w.plan.push('ok', 'revert');
  await fundAgentMatchV3(w.deps, input());
  w.calls.length = 0;
  const r = await fundAgentMatchV3(w.deps, input());
  assert.equal(r.ok, true);
  assert.deepEqual(w.calls, ['accept']);
});

test('terms the contract would reject stop before any approval', async () => {
  const w = world();
  const r = await fundAgentMatchV3(w.deps, input({ milestonePcts: [70, 70] }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'TERMS_NOT_SUPPORTED');
  assert.deepEqual(w.calls, []);
});

test('a trusted match reserves half the price as seller stake; goods start review on arrival', async () => {
  const w = world();
  const r = await fundAgentMatchV3(w.deps, input({ trustedMatch: true, tradeType: 'goods' }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.record.escrowTerms.reservationBps, 5000);
  assert.equal(r.record.escrowTerms.reviewStarts, 1);
});
