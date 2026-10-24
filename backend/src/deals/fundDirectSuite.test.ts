import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgreementEscrow } from '../chain/agreementEscrow.js';
import { agreementDealId, type AgreementLimits } from '../chain/agreementTerms.js';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import { IdentityNeeded } from '../identity/suiteIdentity.js';
import { dealKindForSuite, fundDirectDealSuite, type FundDirectSuiteDeps, type FundDirectSuiteInput } from './fundDirectSuite.js';
import { chooseFundingEscrow, fundingSaltV3 } from './fundDirectV3.js';

type Hex = `0x${string}`;
const ESCROW = `0x${'55'.repeat(20)}` as Hex;
const USDC = '0x3600000000000000000000000000000000000000' as Hex;
const BUYER = `0x${'aa'.repeat(20)}`;
const SELLER = `0x${'bb'.repeat(20)}`;
const BUYER_AGENT = `0x${'22'.repeat(20)}` as Hex;
const SELLER_AGENT = `0x${'33'.repeat(20)}` as Hex;
const JOB = 'deal-s1';
const NOW_MS = 1_800_000_000_000;
const LIMITS: AgreementLimits = { minReview: 3_600, maxReview: 2_592_000, maxHorizon: 31_536_000, perDealCapMicros: 1_005_000_000n, feeBps: 100 };
const Z20 = `0x${'00'.repeat(20)}` as Hex;

const blank = (): DealV3View => ({
  state: DEAL_STATE.None, buyer: Z20, seller: Z20, buyerId: Z20, sellerId: Z20, count: 0, paid: 0, extUsed: 0, revision: 0,
  checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false, deliveredAt: 0n, reviewStartAt: 0n,
  reviewEnd: 0n, deadline: 0n, disputedAt: 0n, proposedAt: 0n, proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n,
  feeReleased: 0n, reserved: 0n, termsHash: `0x${'00'.repeat(32)}`,
});

function world(opts: { buyerRecord?: boolean; sellerRecord?: boolean } = {}) {
  const chain = new Map<string, DealV3View>();
  const calls: string[] = [];
  const patches: Array<Record<string, unknown>> = [];
  const attention: string[] = [];
  const events: string[] = [];
  const plan: Array<'ok' | 'revert'> = [];
  let allowance = 0n;
  let tx = 0;
  let termsHash: Hex = `0x${'00'.repeat(32)}`;
  const receipts = new Map<string, Array<{ name: string; jobId: Hex; args: Record<string, unknown> }>>();
  const escrow = createAgreementEscrow({
    address: ESCROW,
    chainId: 5042002,
    async execute(input) {
      const hash = `0x${(++tx).toString(16).padStart(64, '0')}`;
      const name = input.abiFunctionSignature.split('(')[0]!;
      calls.push(name);
      if ((plan.shift() ?? 'ok') === 'revert') return { txHash: hash };
      const [first] = input.abiParameters as [Hex];
      if (name === 'fund') {
        const id = agreementDealId({ chainId: 5042002, escrow: ESCROW, buyer: BUYER_AGENT, salt: first });
        chain.set(id, { ...blank(), state: DEAL_STATE.Funded, buyer: BUYER_AGENT, seller: SELLER_AGENT, count: 1, termsHash });
        receipts.set(hash, [{ name: 'DealFunded', jobId: id, args: { buyer: BUYER_AGENT } }]);
      }
      if (name === 'accept') chain.set(first, { ...chain.get(first)!, state: DEAL_STATE.Accepted });
      return { txHash: hash };
    },
    readView: async (id) => chain.get(id) ?? blank(),
    readTerms: async () => { throw new Error('unused'); },
    readOwed: async () => 0n,
    readSplit: async () => ({ active: false, sellerBps: 0 }),
    receiptEvents: async (h) => receipts.get(h) ?? [],
    emit: (e) => events.push(e.type),
  });
  const deps: FundDirectSuiteDeps = {
    escrow,
    asset: USDC,
    verifier: `0x${'cd'.repeat(20)}` as Hex,
    readView: async (id) => chain.get(id) ?? blank(),
    readLimits: async () => LIMITS,
    settings: { baseReviewSecs: 3 * 86_400, reclaimGraceSecs: 86_400 },
    requireIdentity: async (user, role) => {
      const has = user === BUYER ? opts.buyerRecord !== false : opts.sellerRecord !== false;
      if (!has) throw new IdentityNeeded('record_setup_needed');
      void role;
    },
    readUsdcBalance: async () => 10_000_000_000n,
    readUsdcAllowance: async () => allowance,
    approveUsdc: async (input) => {
      calls.push('approve');
      allowance = input.amount;
    },
    movements: {
      ensure: async (input) => ({ reference: 'mm-1', amountMicros: input.amountMicros.toString() }),
      prepareLeg: async (_r, leg) => ({ legId: leg.key, idempotencyKey: `${leg.key}-key` }),
      verifyLeg: async () => undefined,
      needsAttention: async (_r, code) => { attention.push(code); },
      complete: async () => undefined,
    },
    patchDeal: async (_j, patch) => {
      patches.push(patch);
      if (typeof patch.escrowTermsHash === 'string') termsHash = patch.escrowTermsHash as Hex;
    },
    emit: (e) => events.push(e.type),
    now: () => NOW_MS,
  };
  return { deps, chain, calls, patches, attention, events, plan };
}

const input = (over: Partial<FundDirectSuiteInput["deal"]> = {}, total = 251_250_000n): FundDirectSuiteInput => ({
  jobId: JOB,
  deal: { buyer: BUYER, seller: SELLER, dealAmountUsdc: '250', createdAt: NOW_MS - 1000, agreementDigest: 'ab'.repeat(32), ...over },
  buyerAgent: { walletId: 'buyer-w', address: BUYER_AGENT },
  sellerAgent: { walletId: 'seller-w', address: SELLER_AGENT },
  milestonePcts: [100],
  authorizedTotalMicros: total,
  operationKey: 'fund:deal-s1',
});

test('chooses_suite_when_enabled', () => {
  assert.equal(chooseFundingEscrow({}, { suiteEnabled: true, v3Enabled: true, v2EscrowExists: false, priorAttempt: false }), 'suite');
  assert.equal(chooseFundingEscrow({}, { suiteEnabled: false, v3Enabled: true, v2EscrowExists: false, priorAttempt: false }), 'v3');
  assert.equal(chooseFundingEscrow({ escrowVersion: 'v3' }, { suiteEnabled: true, v3Enabled: true, v2EscrowExists: false, priorAttempt: false }), 'v3', 'a deal keeps its escrow');
});

test('keeps_v2_for_a_deal_with_a_v2_attempt', () => {
  assert.equal(chooseFundingEscrow({}, { suiteEnabled: true, v3Enabled: false, v2EscrowExists: true, priorAttempt: false }), 'v2');
  assert.equal(chooseFundingEscrow({}, { suiteEnabled: true, v3Enabled: false, v2EscrowExists: false, priorAttempt: true }), 'v2');
});

test('the_kind_of_deal_follows_the_deal', () => {
  assert.equal(dealKindForSuite({}, [100]), 'one_time');
  assert.equal(dealKindForSuite({}, [40, 60]), 'milestones');
  assert.equal(dealKindForSuite({ tradeType: 'goods' }, [100]), 'goods');
});

test('approve_then_fund_then_proof', async () => {
  const w = world();
  const r = await fundDirectDealSuite(w.deps, input());
  assert.equal(r.status, 200);
  assert.deepEqual(w.calls, ['approve', 'fund', 'accept']);
  const intent = w.patches[0]!;
  assert.equal(intent.escrowVersion, 'suite');
  assert.equal(intent.escrowSalt, fundingSaltV3(JOB));
  assert.equal(intent.escrowAddress, ESCROW);
  assert.ok(w.events.includes('deal.accepted'));
});

test('refuses_over_the_cap_before_any_call', async () => {
  const w = world();
  const r = await fundDirectDealSuite(w.deps, input({ dealAmountUsdc: '1001' }, 1_006_005_000n));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'Deals can be up to 1,000 USDC while Karwan is in beta.');
  assert.deepEqual(w.calls, []);
  assert.deepEqual(w.patches, []);
});

test('refuses_without_a_record', async () => {
  const w = world({ buyerRecord: false });
  const r = await fundDirectDealSuite(w.deps, input());
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'record_setup_needed');
  assert.deepEqual(w.calls, []);
});

test('a_changed_total_is_refused_before_signing', async () => {
  const w = world();
  const r = await fundDirectDealSuite(w.deps, input({}, 252_000_000n));
  assert.equal(r.body.code, 'QUOTE_CHANGED');
  assert.deepEqual(w.calls, []);
});

test('circle_complete_without_funded_event_is_not_success', async () => {
  const w = world();
  w.plan.push('revert');
  const r = await fundDirectDealSuite(w.deps, input());
  assert.equal(r.body.code, 'FUND_NOT_CONFIRMED');
  assert.deepEqual(w.attention, ['FUND_NOT_CONFIRMED']);
  assert.ok(!w.events.includes('deal.accepted'));
});

test('resumes_without_a_second_fund', async () => {
  const w = world();
  w.plan.push('ok', 'revert');
  const first = await fundDirectDealSuite(w.deps, input());
  assert.equal(first.status, 502, 'funded, but the accept did not land');
  const stored = Object.assign({}, ...w.patches);
  w.calls.length = 0;
  const again = await fundDirectDealSuite(w.deps, input({ escrowDealId: stored.escrowDealId, escrowTerms: stored.escrowTerms, escrowTermsHash: stored.escrowTermsHash }));
  assert.equal(again.status, 200);
  assert.deepEqual(w.calls, ['accept'], 'the funded deal is read first; no second approve or fund');
});

test('a_seller_without_a_record_leaves_the_deal_funded_and_is_asked', async () => {
  const w = world({ sellerRecord: false });
  const r = await fundDirectDealSuite(w.deps, input());
  assert.equal(r.status, 200);
  assert.equal(r.body.sellerRecordNeeded, true);
  assert.deepEqual(w.calls, ['approve', 'fund']);
  assert.ok(w.events.includes('deal.seller_record_needed'));
});
