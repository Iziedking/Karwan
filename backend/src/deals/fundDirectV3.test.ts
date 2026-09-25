import assert from 'node:assert/strict';
import test from 'node:test';
import { createDealEscrowV3, DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import { dealTermsHash, type DealTermsLimits } from '../chain/dealTermsV3.js';
import {
  chooseFundingEscrow,
  dealShapeV3,
  fundDirectDealV3,
  fundingSaltV3,
  type FundDirectV3Deps,
  type FundDirectV3Input,
} from './fundDirectV3.js';

type Hex = `0x${string}`;

const ESCROW = `0x${'11'.repeat(20)}` as Hex;
const BUYER_AGENT = `0x${'22'.repeat(20)}` as Hex;
const SELLER_AGENT = `0x${'33'.repeat(20)}` as Hex;
const JOB = 'deal-abc';
const NOW_MS = 1_800_000_000_000;
const DAY = 86_400;

const LIMITS: DealTermsLimits = {
  nowSecs: NOW_MS / 1000,
  minReviewSecs: 60,
  maxReviewSecs: 180 * DAY,
  maxHorizonSecs: 730 * DAY,
  maxReservationBps: 10_000,
  highValueUnits: 0n,
  baseReviewSecs: 300,
  reclaimGraceSecs: DAY,
};

function blankDeal(): DealV3View {
  const z = `0x${'00'.repeat(20)}` as Hex;
  return {
    state: DEAL_STATE.None, buyer: z, seller: z, buyerId: z, sellerId: z, count: 0, paid: 0, extUsed: 0,
    revision: 0, checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false,
    deliveredAt: 0n, reviewStartAt: 0n, reviewEnd: 0n, deadline: 0n, disputedAt: 0n, proposedAt: 0n,
    proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n, feeReleased: 0n, reserved: 0n,
    termsHash: `0x${'00'.repeat(32)}`,
  };
}

interface World {
  deps: FundDirectV3Deps;
  chain: Map<string, DealV3View>;
  patches: Array<Record<string, unknown>>;
  attention: string[];
  completed: number;
  approvals: number;
  calls: string[];
  events: string[];
  /// Per-call chain outcomes, in order: 'ok' applies the call, 'revert' is
  /// Circle COMPLETE with nothing changed, 'drift' funds under another buyer.
  plan: Array<'ok' | 'revert' | 'drift'>;
  balance: bigint;
  freeStake: bigint;
  allowance: bigint;
}

function world(over: Partial<Pick<World, 'balance' | 'freeStake'>> = {}): World {
  const w = {
    chain: new Map<string, DealV3View>(),
    patches: [] as Array<Record<string, unknown>>,
    attention: [] as string[],
    completed: 0,
    approvals: 0,
    calls: [] as string[],
    events: [] as string[],
    plan: [] as Array<'ok' | 'revert' | 'drift'>,
    balance: 10_000_000_000n,
    freeStake: 10_000_000_000n,
    allowance: 0n,
    ...over,
  } as World;
  const receipts = new Map<string, Array<{ name: string; jobId: Hex; args: Record<string, unknown> }>>();
  let tx = 0;

  const escrow = createDealEscrowV3({
    address: ESCROW,
    chainId: 5042002,
    async execute(input) {
      const hash = `0x${(++tx).toString(16).padStart(64, '0')}`;
      const step = w.plan.shift() ?? 'ok';
      const name = input.abiFunctionSignature.split('(')[0];
      w.calls.push(name);
      if (step === 'revert') return { txHash: hash };
      const [first, second] = input.abiParameters as [Hex, unknown];
      if (name === 'fund') {
        const salt = first;
        const terms = second as unknown[];
        const buyer = step === 'drift' ? (`0x${'77'.repeat(20)}` as Hex) : BUYER_AGENT;
        const id = escrow.dealIdFor(buyer, salt);
        const seller = terms[0] as Hex;
        const hashOf = fundedTermsHash;
        w.chain.set(id, { ...blankDeal(), state: DEAL_STATE.Funded, buyer, seller, count: 2, termsHash: hashOf });
        receipts.set(hash, [{ name: 'DealFunded', jobId: id, args: { buyer, termsHash: hashOf } }]);
      } else if (name === 'accept') {
        const d = w.chain.get(first)!;
        w.chain.set(first, { ...d, state: DEAL_STATE.Accepted });
      }
      return { txHash: hash };
    },
    async readDeal(id) {
      return w.chain.get(id) ?? blankDeal();
    },
    async readOwed() {
      return 0n;
    },
    async readSplit() {
      return { active: false, sellerBps: 0 };
    },
    async readHeld() {
      return false;
    },
    async receiptEvents(hash) {
      return receipts.get(hash) ?? [];
    },
    emit(e) {
      w.events.push(e.type);
    },
  });

  let fundedTermsHash: Hex = `0x${'00'.repeat(32)}`;
  let refs = 0;
  w.deps = {
    escrow,
    readDeal: async (id) => w.chain.get(id) ?? blankDeal(),
    readLimits: async () => LIMITS,
    readFeeBps: async () => 150,
    readFreeStake: async () => w.freeStake,
    readUsdcBalance: async () => w.balance,
    readUsdcAllowance: async () => w.allowance,
    async approveUsdc(input) {
      w.approvals += 1;
      w.allowance = input.amount;
    },
    movements: {
      async ensure() {
        return { reference: `mm-${++refs}`, amountMicros: '1007500000' };
      },
      async prepareLeg(_ref, leg) {
        return { legId: leg.key, idempotencyKey: `${leg.key}-key`, lifecycle: undefined };
      },
      async verifyLeg() {},
      async needsAttention(_ref, code) {
        w.attention.push(code);
      },
      async complete() {
        w.completed += 1;
      },
    },
    async patchDeal(_jobId, patch) {
      w.patches.push(patch);
      if (typeof patch.escrowTermsHash === 'string') fundedTermsHash = patch.escrowTermsHash as Hex;
    },
    emit(e) {
      w.events.push(e.type);
    },
    now: () => NOW_MS,
  };
  return w;
}

function input(over: Partial<FundDirectV3Input['deal']> = {}): FundDirectV3Input {
  return {
    jobId: JOB,
    deal: {
      buyer: '0xbuyer',
      seller: '0xseller',
      dealAmountUsdc: '1000',
      createdAt: NOW_MS - 3_600_000,
      deadlineUnix: NOW_MS / 1000 - 3_600 + 10 * DAY,
      requireStake: false,
      requireStakePct: undefined,
      tradeType: 'service',
      evidenceRequired: false,
      agreementDigest: 'ab'.repeat(32),
      ...over,
    },
    buyerAgent: { walletId: 'buyer-w', address: BUYER_AGENT },
    sellerAgent: { walletId: 'seller-w', address: SELLER_AGENT },
    milestonePcts: [50, 50],
    authorizedTotalMicros: 1_007_500_000n,
    operationKey: `fund:${JOB}`,
  };
}

const patched = (w: World) => Object.assign({}, ...w.patches);

// ------------------------------ escrow choice ------------------------------

test('a deal already on v2, or with an earlier v2 attempt, never moves to v3', () => {
  assert.equal(chooseFundingEscrow({ escrowVersion: 'v2' }, { v3Enabled: true, v2EscrowExists: false, priorAttempt: false }), 'v2');
  assert.equal(chooseFundingEscrow({}, { v3Enabled: true, v2EscrowExists: true, priorAttempt: false }), 'v2');
  assert.equal(chooseFundingEscrow({}, { v3Enabled: true, v2EscrowExists: false, priorAttempt: true }), 'v2');
});

test('a deal stamped v3 stays on v3 even if the flag is switched off', () => {
  assert.equal(chooseFundingEscrow({ escrowVersion: 'v3' }, { v3Enabled: false, v2EscrowExists: false, priorAttempt: true }), 'v3');
});

test('a fresh deal funds on v3 only with the flag on', () => {
  assert.equal(chooseFundingEscrow({}, { v3Enabled: true, v2EscrowExists: false, priorAttempt: false }), 'v3');
  assert.equal(chooseFundingEscrow({}, { v3Enabled: false, v2EscrowExists: false, priorAttempt: false }), 'v2');
});

test('deal shape: goods and mixed start on arrival, required evidence starts on the check', () => {
  assert.equal(dealShapeV3({ tradeType: 'goods' }).shape, 'goods');
  assert.equal(dealShapeV3({ tradeType: 'mixed' }).shape, 'goods');
  const checked = dealShapeV3({ tradeType: 'service', evidenceRequired: true });
  assert.equal(checked.shape, 'checked');
  assert.match(checked.checkPolicy ?? '', /^0x[0-9a-f]{64}$/);
  assert.equal(dealShapeV3({}).shape, 'service');
});

test('the salt is fixed per deal, so a retry after a crash targets the same escrow deal', () => {
  assert.equal(fundingSaltV3(JOB), fundingSaltV3(JOB));
  assert.notEqual(fundingSaltV3(JOB), fundingSaltV3('other'));
});

// ------------------------------- fresh funding ------------------------------

test('fresh funding: intent is saved first, then approve, fund and accept, then the deal is accepted', async () => {
  const w = world();
  const r = await fundDirectDealV3(w.deps, input());
  assert.equal(r.status, 200);
  assert.deepEqual(w.calls, ['fund', 'accept']);
  assert.equal(w.approvals, 1);
  const first = w.patches[0];
  assert.equal(first.escrowVersion, 'v3', 'the version is stamped before any transaction');
  assert.equal(first.escrowAddress, ESCROW);
  assert.match(String(first.escrowDealId), /^0x[0-9a-f]{64}$/);
  const all = patched(w);
  assert.ok(all.fundTxHash);
  assert.equal(all.acceptedAt, NOW_MS);
  assert.equal(all.sellerAgentAddress, SELLER_AGENT);
  assert.equal(w.completed, 1);
  assert.ok(w.events.includes('deal.accepted'));
  assert.deepEqual(w.attention, []);
});

test('the delivery deadline is re-anchored to now before it goes into the terms', async () => {
  const w = world();
  await fundDirectDealV3(w.deps, input());
  const all = patched(w);
  const window = input().deal.deadlineUnix! - Math.floor(input().deal.createdAt / 1000);
  assert.equal(all.deadlineUnix, NOW_MS / 1000 + window);
  const terms = all.escrowTerms as { deliveryDeadline: string };
  assert.equal(terms.deliveryDeadline, String(NOW_MS / 1000 + window));
});

test('a total that differs from what the buyer authorized is refused before any money moves', async () => {
  const w = world();
  const r = await fundDirectDealV3(w.deps, { ...input(), authorizedTotalMicros: 1_000_000_000n });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'QUOTE_CHANGED');
  assert.deepEqual(w.calls, []);
  assert.equal(w.approvals, 0);
});

test('a seller without enough free stake is refused before any money moves', async () => {
  const w = world({ freeStake: 100n });
  const r = await fundDirectDealV3(w.deps, input({ requireStake: true, requireStakePct: 50 }));
  assert.equal(r.body.code, 'INSUFFICIENT_STAKE');
  assert.deepEqual(w.calls, []);
});

test('a buyer agent short on USDC is refused before any money moves', async () => {
  const w = world({ balance: 5n });
  const r = await fundDirectDealV3(w.deps, input());
  assert.equal(r.body.code, 'INSUFFICIENT_AGENT_BALANCE');
  assert.deepEqual(w.calls, []);
});

test('terms the contract would reject are refused with their reason, before any money moves', async () => {
  const w = world();
  const r = await fundDirectDealV3(w.deps, { ...input(), milestonePcts: [60, 60] });
  assert.equal(r.body.code, 'TERMS_NOT_SUPPORTED');
  assert.deepEqual(w.calls, []);
});

test('a fund that Circle reports but the chain never shows is flagged, and the deal is not accepted', async () => {
  const w = world();
  w.plan.push('revert');
  const r = await fundDirectDealV3(w.deps, input());
  assert.equal(r.body.code, 'FUND_NOT_CONFIRMED');
  assert.deepEqual(w.attention, ['FUND_NOT_CONFIRMED']);
  assert.equal(patched(w).acceptedAt, undefined);
});

test('money that landed under another id (signer drift) is recorded for reconciliation', async () => {
  const w = world();
  w.plan.push('drift');
  const r = await fundDirectDealV3(w.deps, input());
  assert.equal(r.body.code, 'FUND_ID_MISMATCH');
  assert.deepEqual(w.attention, ['FUND_ID_MISMATCH']);
  assert.match(String(patched(w).escrowFundedUnderId), /^0x[0-9a-f]{64}$/);
});

test('funded but activation did not land: the funding is kept on record and the error is actionable', async () => {
  const w = world();
  w.plan.push('ok', 'revert');
  const r = await fundDirectDealV3(w.deps, input({ requireStake: true, requireStakePct: 50 }));
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'ACCEPT_NOT_CONFIRMED');
  assert.ok(patched(w).fundTxHash, 'the fund is remembered');
  assert.equal(patched(w).acceptedAt, undefined);
  assert.match(String(r.body.error), /500 USDC/);
});

// ------------------------------ resume after crash ---------------------------

test('resume: funded on-chain but not activated, only accept runs, no second transfer', async () => {
  const w = world();
  w.plan.push('ok', 'revert');
  await fundDirectDealV3(w.deps, input());
  const saved = patched(w);
  w.calls.length = 0;
  const r = await fundDirectDealV3(w.deps, {
    ...input(),
    deal: { ...input().deal, ...saved } as FundDirectV3Input['deal'],
  });
  assert.equal(r.status, 200);
  assert.deepEqual(w.calls, ['accept']);
  assert.equal(w.approvals, 1, 'no second approval');
});

test('resume: an attempt that never landed funds again with the stored terms and the same id', async () => {
  const w = world();
  w.plan.push('revert');
  await fundDirectDealV3(w.deps, input());
  const saved = patched(w);
  w.calls.length = 0;
  const r = await fundDirectDealV3(w.deps, {
    ...input(),
    deal: { ...input().deal, ...saved } as FundDirectV3Input['deal'],
  });
  assert.equal(r.status, 200);
  assert.deepEqual(w.calls, ['fund', 'accept']);
  assert.equal(r.body.escrowDealId, saved.escrowDealId);
});

test('resume with a changed fee asks the buyer to confirm the new total', async () => {
  const w = world();
  w.plan.push('revert');
  await fundDirectDealV3(w.deps, input());
  const saved = patched(w);
  w.calls.length = 0;
  const r = await fundDirectDealV3({ ...w.deps, readFeeBps: async () => 300 }, {
    ...input(),
    deal: { ...input().deal, ...saved } as FundDirectV3Input['deal'],
  });
  assert.equal(r.body.code, 'QUOTE_CHANGED');
  assert.deepEqual(w.calls, []);
});

test('resume: already accepted on-chain, the deal is simply marked accepted', async () => {
  const w = world();
  await fundDirectDealV3(w.deps, input());
  const saved = patched(w);
  w.calls.length = 0;
  const r = await fundDirectDealV3(w.deps, {
    ...input(),
    deal: { ...input().deal, ...saved, acceptedAt: undefined } as FundDirectV3Input['deal'],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.recovered, true);
  assert.deepEqual(w.calls, []);
});

test('resume: an escrow deal that already closed is not funded again', async () => {
  const w = world();
  await fundDirectDealV3(w.deps, input());
  const saved = patched(w);
  const id = saved.escrowDealId as string;
  w.chain.set(id, { ...w.chain.get(id)!, state: DEAL_STATE.Refunded });
  w.calls.length = 0;
  const r = await fundDirectDealV3(w.deps, {
    ...input(),
    deal: { ...input().deal, ...saved, acceptedAt: undefined } as FundDirectV3Input['deal'],
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ESCROW_CLOSED');
  assert.deepEqual(w.calls, []);
});

test('the terms hash on record is the one the seller accepts', async () => {
  const w = world();
  await fundDirectDealV3(w.deps, input());
  const all = patched(w);
  const terms = all.escrowTerms as Record<string, unknown>;
  assert.equal(typeof terms.amount, 'string', 'bigints are stored as strings');
  assert.equal(all.escrowTermsHash, dealTermsHash(reviveTerms(terms)));
});

function reviveTerms(t: Record<string, unknown>) {
  return {
    ...(t as object),
    amount: BigInt(t.amount as string),
    deliveryDeadline: BigInt(t.deliveryDeadline as string),
  } as Parameters<typeof dealTermsHash>[0];
}

test('an unexpected failure carries the movement reference so the route can flag it', async () => {
  const w = world();
  const boom = new Error('circle unreachable');
  const r = fundDirectDealV3({ ...w.deps, approveUsdc: async () => { throw boom; } }, input());
  await assert.rejects(r, (err: unknown) => err === boom && typeof (err as { movementReference?: string }).movementReference === 'string');
});
