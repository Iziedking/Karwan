import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgreementEscrow } from '../chain/agreementEscrow.js';
import { agreementDealId, agreementTermsHash, type AgreementLimits, type AgreementTerms } from '../chain/agreementTerms.js';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import { fundAgentMatchSuite, type FundAgentMatchSuiteDeps, type FundAgentMatchSuiteInput } from './fundAgentMatchSuite.js';

type Hex = `0x${string}`;
const ESCROW = `0x${'55'.repeat(20)}` as Hex;
const USDC = '0x3600000000000000000000000000000000000000' as Hex;
const BUYER_AGENT = `0x${'22'.repeat(20)}` as Hex;
const SELLER_AGENT = `0x${'33'.repeat(20)}` as Hex;
const JOB = `0x${'aa'.repeat(32)}` as Hex;
const NOW_MS = 1_800_000_000_000;
const DAY = 86_400;
const LIMITS: AgreementLimits = { minReview: 3_600, maxReview: 2_592_000, maxHorizon: 31_536_000, perDealCapMicros: 1_005_000_000n, feeBps: 100 };
const Z20 = `0x${'00'.repeat(20)}` as Hex;

const blank = (): DealV3View => ({
  state: DEAL_STATE.None, buyer: Z20, seller: Z20, buyerId: Z20, sellerId: Z20, count: 0, paid: 0, extUsed: 0, revision: 0,
  checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false, deliveredAt: 0n, reviewStartAt: 0n,
  reviewEnd: 0n, deadline: 0n, disputedAt: 0n, proposedAt: 0n, proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n,
  feeReleased: 0n, reserved: 0n, termsHash: `0x${'00'.repeat(32)}`,
});

function world(opts: { buyerRecord?: boolean } = {}) {
  const chain = new Map<string, DealV3View>();
  const onChainTerms = new Map<string, AgreementTerms>();
  const receipts = new Map<string, Array<{ name: string; jobId: Hex; args: Record<string, unknown> }>>();
  const calls: string[] = [];
  const plan: Array<'ok' | 'revert'> = [];
  let tx = 0;
  let allowance = 0n;
  let lastTerms: AgreementTerms | null = null;
  const escrow = createAgreementEscrow({
    address: ESCROW,
    chainId: 5042002,
    async execute(input) {
      const hash = `0x${(++tx).toString(16).padStart(64, '0')}`;
      const name = input.abiFunctionSignature.split('(')[0]!;
      calls.push(name);
      if ((plan.shift() ?? 'ok') === 'revert') return { txHash: hash };
      if (name === 'fund') {
        const salt = (input.abiParameters as [Hex])[0];
        const id = agreementDealId({ chainId: 5042002, escrow: ESCROW, buyer: BUYER_AGENT, salt });
        chain.set(id, { ...blank(), state: DEAL_STATE.Funded, buyer: BUYER_AGENT, seller: SELLER_AGENT, termsHash: agreementTermsHash(lastTerms!) });
        onChainTerms.set(id, lastTerms!);
        receipts.set(hash, [{ name: 'DealFunded', jobId: id, args: { buyer: BUYER_AGENT } }]);
      } else if (name === 'accept') {
        const id = (input.abiParameters as [Hex])[0];
        chain.set(id, { ...chain.get(id)!, state: DEAL_STATE.Accepted });
      }
      return { txHash: hash };
    },
    readView: async (id) => chain.get(id) ?? blank(),
    readTerms: async (id) => onChainTerms.get(id)!,
    readOwed: async () => 0n,
    readSplit: async () => ({ active: false, sellerBps: 0 }),
    receiptEvents: async (h) => receipts.get(h) ?? [],
    emit: () => undefined,
  });
  const fund = escrow.fund;
  escrow.fund = (args) => {
    lastTerms = args.terms;
    return fund(args);
  };
  const deps: FundAgentMatchSuiteDeps = {
    escrow,
    asset: USDC,
    readView: async (id) => chain.get(id) ?? blank(),
    readLimits: async () => LIMITS,
    settings: { baseReviewSecs: 3 * DAY, reclaimGraceSecs: DAY },
    ensureRecord: async () => (opts.buyerRecord === false ? 'not-ready' : 'ready'),
    freeBuyingAgent: async () => false,
    readUsdcAllowance: async () => allowance,
    approveUsdc: async (i) => {
      calls.push('approve');
      allowance = i.amount;
    },
    now: () => NOW_MS,
  };
  return { deps, chain, calls, plan };
}

const input = (over: Partial<FundAgentMatchSuiteInput> = {}): FundAgentMatchSuiteInput => ({
  jobId: JOB,
  buyerUser: `0x${'a1'.repeat(20)}`,
  sellerUser: `0x${'b1'.repeat(20)}`,
  buyerAgent: { walletId: 'buyer-w', address: BUYER_AGENT },
  sellerAgent: { walletId: 'seller-w', address: SELLER_AGENT },
  priceUnits: 200_000_000n,
  milestonePcts: [50, 50],
  deadlineUnix: NOW_MS / 1000 + 5 * DAY,
  tradeType: 'service',
  agreementHash: `0x${'cd'.repeat(32)}`,
  ...over,
});

test('matched_deal_funds_on_the_suite_and_the_seller_agent_accepts', async () => {
  const w = world();
  const r = await fundAgentMatchSuite(w.deps, input());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.record.escrowVersion, 'suite');
  assert.equal(r.accepted, true);
  assert.deepEqual(w.calls, ['approve', 'fund', 'accept']);
  assert.deepEqual(r.record.escrowTerms.trancheBps.slice(0, 3), [5000, 5000, 0]);
});

test('a_matched_buyer_with_no_record_still_pays', async () => {
  const w = world({ buyerRecord: false });
  const r = await fundAgentMatchSuite(w.deps, input());
  assert.equal(r.ok, true);
  assert.deepEqual(w.calls, ['approve', 'fund', 'accept'], 'nothing waits for a record');
});

test('a_matched_deal_over_the_cap_is_refused', async () => {
  const w = world();
  const r = await fundAgentMatchSuite(w.deps, input({ priceUnits: 1_001_000_000n }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'TERMS_NOT_SUPPORTED');
  assert.deepEqual(w.calls, []);
});

test('a_fund_circle_reports_but_the_chain_never_shows_is_not_funded', async () => {
  const w = world();
  w.plan.push('revert');
  const r = await fundAgentMatchSuite(w.deps, input());
  assert.deepEqual(r, { ok: false, reason: 'FUND_NOT_CONFIRMED' });
});

test('a_retry_after_a_crash_records_the_terms_the_escrow_holds_and_does_not_pay_twice', async () => {
  const w = world();
  w.plan.push('ok', 'revert');
  const first = await fundAgentMatchSuite(w.deps, input());
  assert.ok(first.ok && !first.accepted);
  w.calls.length = 0;
  const later = { ...w.deps, now: () => NOW_MS + 3_600_000 };
  const again = await fundAgentMatchSuite(later, input());
  assert.ok(again.ok);
  assert.deepEqual(w.calls, ['accept']);
  if (first.ok && again.ok) assert.equal(again.record.escrowTermsHash, first.record.escrowTermsHash, 'the record names what the chain holds');
});
