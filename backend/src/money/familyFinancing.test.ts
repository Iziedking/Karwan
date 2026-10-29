import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Hex, type Log, type TransactionReceipt } from 'viem';
import type { DirectDeal } from '../db/deals.js';
import type { FactoringOffer } from '../db/factoring.js';
import { lineIdFor, tradeFinanceAbi } from '../chain/tradeFinance.js';
import {
  createFamilyFinancing,
  eligibility,
  guaranteeGap,
  settleDecision,
  testFinancierTerms,
  type FamilyFinancingPorts,
  type Receivable,
} from './familyFinancing.js';

/// Get paid now on the escrow family (view 18, spec 2026-10-29).

const TF: Hex = '0xaeeada6aef8b07262224f010264ef1968177c779';
const VAULT: Hex = '0xf5fd1fd6d790da42c022a5c5404676c048007ed5';
const USDC: Hex = '0x3600000000000000000000000000000000000000';
const ESCROW: Hex = '0x55460d2b8b0d8067ea33406b310224b5bd44f43c';
const DEAL_ID: Hex = `0x${'11'.repeat(32)}`;
const SELLER = '0x5e11e5000000000000000000000000000000005e';
const AGENT: Hex = '0xa9e0000000000000000000000000000000000a9e';
const FIN: Hex = '0xf100000000000000000000000000000000000f10';
const NOW = 1_800_000_000_000;
const M = (usdc: number) => BigInt(Math.round(usdc * 1e6));

const deal = (over: Partial<DirectDeal> = {}): DirectDeal => ({
  jobId: '0xjob', buyer: '0xb0', seller: SELLER, tradeLane: 'finance', escrowVersion: 'suite', escrowAddress: ESCROW,
  escrowDealId: DEAL_ID, sellerAgentAddress: AGENT, sellerAgentWalletId: 'w-agent', dealAmountUsdc: '150', acceptedAt: 1,
  ...over,
} as DirectDeal);

const receivable = (over: Partial<Receivable> = {}): Receivable => ({ asset: USDC, seller: AGENT, unpaid: M(150), horizon: 2_000_000_000n, open: true, financeable: true, ...over });

const offer = (over: Partial<FactoringOffer> = {}): FactoringOffer => ({
  id: 'o1', invoiceId: '0xjob', financier: FIN, seller: SELLER, faceValueUsdc: '150', claimableAtOfferUsdc: '150',
  offeredAdvanceUsdc: '120', expectedReturnUsdc: '123.6', discountBps: 2000, status: 'offered', offeredAt: NOW - 1000,
  expiresAt: NOW + 3_600_000, rail: 'family', stakeMicros: '12000000', createdAt: 1, updatedAt: 1, ...over,
});

function receiptFor(lineId: Hex, advance = M(120), to: Hex = AGENT): TransactionReceipt {
  const topics = (abi: readonly unknown[], eventName: string, args: Record<string, unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    encodeEventTopics({ abi: abi as any, eventName, args } as any) as Hex[];
  const log = (address: Hex, t: Hex[], data: Hex) => ({ address, topics: t, data, blockHash: null, blockNumber: null, logIndex: 0, transactionHash: null, transactionIndex: 0, removed: false }) as unknown as Log;
  return {
    status: 'success',
    logs: [
      log(TF, topics(tradeFinanceAbi, 'LineOpened', { lineId, escrow: ESCROW, dealId: DEAL_ID }),
        encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [AGENT, FIN, advance, M(123.6), M(12)])),
      log(USDC, topics(erc20Abi, 'Transfer', { from: FIN, to }), encodeAbiParameters([{ type: 'uint256' }], [advance])),
    ],
  } as unknown as TransactionReceipt;
}

const LINE = lineIdFor(5042002, TF, { escrow: ESCROW, dealId: DEAL_ID, financier: FIN, advance: M(120), repay: M(123.6), stake: M(12) });

function world(over: { offers?: FactoringOffer[]; r?: Receivable; free?: bigint; spendable?: bigint; held?: boolean; receipt?: TransactionReceipt; ready?: boolean; financierFunds?: bigint } = {}) {
  const offers = new Map((over.offers ?? [offer()]).map((o) => [o.id, { ...o }]));
  const calls: string[] = [];
  const signed: Array<{ walletId: string; address: Hex; primaryType: string }> = [];
  const ports: FamilyFinancingPorts = {
    addresses: { tradeFinance: TF, vault: VAULT, usdc: USDC, chainId: 5042002 },
    deal: async () => deal(),
    receivable: async () => over.r ?? receivable(),
    freeGuarantee: async () => over.free ?? M(50),
    spendable: async () => over.spendable ?? M(100),
    sellerHeld: async () => over.held ?? true,
    sellerReady: async () => over.ready ?? true,
    balance: async () => over.financierFunds ?? M(1000),
    nextNonce: async () => 7n,
    signAsSeller: async (walletId, address, typed) => {
      signed.push({ walletId, address, primaryType: (typed as { primaryType: string }).primaryType });
      calls.push(`sign:${(typed as { primaryType: string }).primaryType}`);
      return '0x5151';
    },
    putUpGuarantee: async ({ amount }) => { calls.push(`putUp:${amount}`); },
    executeOpen: async ({ calls: c }) => { calls.push(`open:${c.length}`); return { txHash: '0x0123' as Hex }; },
    receipt: async () => over.receipt ?? receiptFor(LINE),
    markDealFinanced: async (jobId, offerId) => { calls.push(`mark:${jobId}:${offerId}`); },
    offers: {
      get: async (id) => offers.get(id) ?? null,
      listForDeal: async () => [...offers.values()],
      create: async (o) => { const full = { ...o, createdAt: 1, updatedAt: 1 } as FactoringOffer; offers.set(o.id, full); return full; },
      patch: async (id, p) => { const n = { ...offers.get(id)!, ...p }; offers.set(id, n); return n; },
      patchIfStatus: async (id, expected, p) => {
        const cur = offers.get(id);
        if (!cur || cur.status !== expected) return null;
        const n = { ...cur, ...p }; offers.set(id, n); return n;
      },
    },
    now: () => NOW,
  };
  return { ports, offers, calls, signed, core: createFamilyFinancing(ports) };
}

test('test financier terms: 150 owed gives 120 now, 123.60 back, 12 held', () => {
  assert.deepEqual(testFinancierTerms(M(150)), { advance: M(120), repay: M(123.6), stake: M(12) });
  assert.deepEqual(testFinancierTerms(M(99.99)), { advance: M(79.99), repay: 82_389_700n, stake: 7_999_000n });
});

test('eligibility table', () => {
  const r = receivable();
  assert.deepEqual(eligibility(deal(), r, true, []), { ok: true });
  assert.deepEqual(eligibility(deal({ tradeLane: 'service' }), r, true, []), { ok: false, code: 'not_business' });
  assert.deepEqual(eligibility(deal({ escrowVersion: 'v2' }), r, true, []), { ok: false, code: 'not_family' });
  assert.deepEqual(eligibility(deal(), receivable({ financeable: false }), true, []), { ok: false, code: 'not_financeable' });
  assert.deepEqual(eligibility(deal(), r, false, []), { ok: false, code: 'record_not_ready' });
  assert.deepEqual(eligibility(deal(), r, true, [offer({ status: 'awaiting_financier' })]), { ok: false, code: 'line_in_progress' });
  assert.deepEqual(eligibility(deal(), r, true, [offer({ status: 'accepted' })]), { ok: false, code: 'line_in_progress' });
});

test('guarantee gap', () => {
  assert.equal(guaranteeGap(M(12), M(50)), 0n);
  assert.equal(guaranteeGap(M(12), M(4)), M(8));
});

test('takeOffer refuses when the deal has less left than the payback', async () => {
  const { core } = world({ r: receivable({ unpaid: M(100) }) });
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: false });
  assert.equal('code' in out && out.code, 'deal_paid_out');
});

test('takeOffer refuses anyone but the seller', async () => {
  const { core } = world();
  const out = await core.takeOffer({ offerId: 'o1', seller: '0xother', putUpGap: false });
  assert.equal('code' in out && out.code, 'not_seller');
});

test('guarantee short without the combined step returns the gap', async () => {
  const { core, calls } = world({ free: M(4) });
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: false });
  assert.equal('code' in out && out.code, 'guarantee_short');
  assert.equal('gapMicros' in out && out.gapMicros, '8000000');
  assert.deepEqual(calls, []);
});

test('guarantee gap larger than the balance is refused', async () => {
  const { core, calls } = world({ free: M(4), spendable: M(5) });
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: true });
  assert.equal('code' in out && out.code, 'balance_short');
  assert.deepEqual(calls, []);
});

test('an own wallet puts the gap up itself first', async () => {
  const { core, calls } = world({ free: M(4), held: false });
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: true });
  assert.equal('code' in out && out.code, 'guarantee_short');
  assert.deepEqual(calls, []);
});

test('combined step puts up the gap, then signs, then opens', async () => {
  const { core, calls } = world({ free: M(4), offers: [offer({ financierWalletId: 'w-fin' })] });
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: true });
  assert.equal('state' in out && out.state, 'accepted');
  assert.deepEqual(calls, ['putUp:8000000', 'sign:Assign', 'sign:Reserve', 'open:2', 'mark:0xjob:o1']);
});

test('held financier: opens and proves, offer accepted, others superseded', async () => {
  const { core, offers, signed } = world({ offers: [offer({ financierWalletId: 'w-fin' }), offer({ id: 'o2', financier: '0xf2' })] });
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: false });
  assert.deepEqual(out, { state: 'accepted', txHash: '0x0123' });
  assert.equal(offers.get('o1')!.status, 'accepted');
  assert.equal(offers.get('o1')!.lineId, LINE);
  assert.equal(offers.get('o1')!.advanceTxHash, '0x0123');
  assert.equal(offers.get('o2')!.status, 'superseded');
  assert.deepEqual(signed.map((s) => [s.walletId, s.address]), [['w-agent', AGENT], ['w-agent', AGENT]]);
});

test('held financier: a receipt that pays the wrong wallet is refused and never accepted', async () => {
  const { core, offers } = world({ offers: [offer({ financierWalletId: 'w-fin' })], receipt: receiptFor(LINE, M(120), '0x9999999999999999999999999999999999999999') });
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: false });
  assert.equal('code' in out && out.code, 'open_unproven');
  assert.equal(offers.get('o1')!.status, 'awaiting_financier');
});

test('own-wallet financier: offer waits with a 24h deadline and both signatures stored', async () => {
  const { core, offers, calls } = world();
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: false });
  assert.deepEqual(out, { state: 'awaiting_financier', deadline: NOW + 86_400_000 });
  const o = offers.get('o1')!;
  assert.equal(o.status, 'awaiting_financier');
  assert.equal(o.sellerDeadline, NOW + 86_400_000);
  assert.equal(o.sellerSigned?.assign.nonce, '7');
  assert.equal(o.sellerSigned?.assign.deadline, String(NOW / 1000 + 86_400));
  assert.equal(o.sellerSigned?.expiresAt, String(2_000_000_000n + 210n * 86_400n));
  assert.ok(!calls.some((c) => c.startsWith('open')));
});

test('one taken offer per deal', async () => {
  const { core } = world({ offers: [offer({ id: 'o0', status: 'awaiting_financier', sellerDeadline: NOW + 1000 }), offer()] });
  const out = await core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: false });
  assert.equal('code' in out && out.code, 'line_in_progress');
});

test('prepareOpenCalls refuses past the deadline and expires the offer', async () => {
  const { core, offers } = world({ offers: [offer({ status: 'awaiting_financier', sellerDeadline: NOW - 1, lineId: LINE, sellerSigned: { assign: { nonce: '7', deadline: '1', sig: '0x01' }, reserve: { deadline: '1', sig: '0x02' }, expiresAt: '9' } })] });
  const out = await core.prepareOpenCalls({ offerId: 'o1', financier: FIN });
  assert.equal('code' in out && out.code, 'expired');
  assert.equal(offers.get('o1')!.status, 'expired');
});

const waiting = () => offer({ status: 'awaiting_financier', sellerDeadline: NOW + 1000, lineId: LINE, sellerSigned: { assign: { nonce: '7', deadline: '1', sig: '0x01' }, reserve: { deadline: '1', sig: '0x02' }, expiresAt: '9' } });

test('prepareOpenCalls only for the offer financier', async () => {
  const { core } = world({ offers: [waiting()] });
  const refused = await core.prepareOpenCalls({ offerId: 'o1', financier: '0xf2' });
  assert.equal('code' in refused && refused.code, 'not_financier');
  const ok = await core.prepareOpenCalls({ offerId: 'o1', financier: FIN.toUpperCase().replace('0X', '0x') });
  assert.equal('calls' in ok && ok.calls.length, 2);
});

test('prepareOpenCalls refuses when the financier wallet no longer holds the advance', async () => {
  const { core } = world({ offers: [waiting()], financierFunds: M(50) });
  const out = await core.prepareOpenCalls({ offerId: 'o1', financier: FIN });
  assert.equal('code' in out && out.code, 'financier_short');
});

test('completeOpen proves the receipt; a wrong receipt leaves the offer waiting', async () => {
  const bad = world({ offers: [waiting()], receipt: receiptFor(LINE, M(100)) });
  const refused = await bad.core.completeOpen({ offerId: 'o1', financier: FIN, txHash: '0xab' });
  assert.equal('code' in refused && refused.code, 'open_unproven');
  assert.equal(bad.offers.get('o1')!.status, 'awaiting_financier');
  const good = world({ offers: [waiting(), offer({ id: 'o2' })] });
  assert.deepEqual(await good.core.completeOpen({ offerId: 'o1', financier: FIN, txHash: '0xab' }), { state: 'accepted' });
  assert.equal(good.offers.get('o1')!.advanceTxHash, '0xab');
  assert.equal(good.offers.get('o2')!.status, 'superseded');
});

test('createFamilyOffer stores the hold and refuses a hold under 10%', async () => {
  const { core, offers } = world({ offers: [] });
  const low = await core.createFamilyOffer({ jobId: '0xjob', financier: FIN, advance: M(120), repay: M(123.6), stake: M(11.99), expiresInHours: 24 });
  assert.equal('code' in low && low.code, 'hold_too_low');
  const out = await core.createFamilyOffer({ jobId: '0xjob', financier: FIN, advance: M(120), repay: M(123.6), stake: M(12), walletId: 'w-fin', expiresInHours: 24 });
  assert.ok('offer' in out);
  const stored = [...offers.values()][0]!;
  assert.equal(stored.rail, 'family');
  assert.equal(stored.stakeMicros, '12000000');
  assert.equal(stored.financierWalletId, 'w-fin');
  assert.equal(stored.offeredAdvanceUsdc, '120');
  assert.equal(stored.expectedReturnUsdc, '123.6');
});

test('createFamilyOffer refuses a payback above what the deal still owes, and a party as financier', async () => {
  const { core } = world({ offers: [] });
  const over = await core.createFamilyOffer({ jobId: '0xjob', financier: FIN, advance: M(120), repay: M(151), stake: M(12), expiresInHours: 24 });
  assert.equal('code' in over && over.code, 'bad_terms');
  const party = await core.createFamilyOffer({ jobId: '0xjob', financier: SELLER, advance: M(120), repay: M(123.6), stake: M(12), expiresInHours: 24 });
  assert.equal('code' in party && party.code, 'financier_is_party');
});

test('settleDecision: settle once the deal ended, keep when the hold ends too early, wait otherwise', () => {
  const accepted = offer({ status: 'accepted', lineId: LINE });
  const horizon = 2_000_000_000n;
  const full = horizon + 210n * 86_400n;
  assert.equal(settleDecision({ offer: accepted, r: receivable({ open: false }), holdEnd: full }), 'settle');
  assert.equal(settleDecision({ offer: accepted, r: receivable({ horizon: horizon + 10n }), holdEnd: full }), 'keep');
  assert.equal(settleDecision({ offer: accepted, r: receivable(), holdEnd: full }), 'wait');
  assert.equal(settleDecision({ offer: offer(), r: receivable({ open: false }), holdEnd: full }), 'wait');
});

test('two taps at once put up the gap only once', async () => {
  const { core, calls } = world({ free: M(4), offers: [offer({ financierWalletId: 'w-fin' }), offer({ id: 'o2', financierWalletId: 'w-fin' })] });
  const [a, b] = await Promise.all([
    core.takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: true }),
    core.takeOffer({ offerId: 'o2', seller: SELLER, putUpGap: true }),
  ]);
  assert.equal(calls.filter((c) => c.startsWith('putUp')).length, 1);
  assert.equal([a, b].filter((r) => 'code' in r && r.code === 'line_in_progress').length, 1);
});

test('an offer whose 24 hours passed no longer blocks the deal', () => {
  const lapsed = offer({ status: 'awaiting_financier', sellerDeadline: NOW - 1 });
  assert.deepEqual(eligibility(deal(), receivable(), true, [lapsed], NOW), { ok: true });
  assert.deepEqual(eligibility(deal(), receivable(), true, [offer({ status: 'awaiting_financier', sellerDeadline: NOW + 1 })], NOW), { ok: false, code: 'line_in_progress' });
});

test('a held financier whose open fails leaves the offer to lapse, not stuck', async () => {
  const { ports, offers } = world({ offers: [offer({ financierWalletId: 'w-fin' })] });
  ports.executeOpen = async () => { throw new Error('Circle did not settle'); };
  const out = await createFamilyFinancing(ports).takeOffer({ offerId: 'o1', seller: SELLER, putUpGap: false });
  assert.equal('code' in out && out.code, 'open_unproven');
  assert.equal(offers.get('o1')!.status, 'awaiting_financier');
  assert.ok(offers.get('o1')!.sellerDeadline! > NOW);
});
