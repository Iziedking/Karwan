import assert from 'node:assert/strict';
import test from 'node:test';
import { AGREEMENT_STATE, createAgreementEscrow, toDealView, type AgreementEscrowPorts } from './agreementEscrow.js';
import { agreementDealId, agreementTermsHash, type AgreementTerms } from './agreementTerms.js';
import { DEAL_STATE, EscrowProofError, type DealV3View } from './dealEscrowV3.js';

type Hex = `0x${string}`;

const ESCROW = `0x${'11'.repeat(20)}` as Hex;
const BUYER = `0x${'22'.repeat(20)}` as Hex;
const SELLER = `0x${'33'.repeat(20)}` as Hex;
const USDC = '0x3600000000000000000000000000000000000000' as Hex;
const SENIOR = `0x${'5e'.repeat(20)}` as Hex;
const REVIEW = `0x${'4e'.repeat(20)}` as Hex;
const SALT = `0x${'44'.repeat(32)}` as Hex;
const CHAIN = 5042002;
const Z20 = `0x${'00'.repeat(20)}` as Hex;
const Z32 = `0x${'00'.repeat(32)}` as Hex;

const TERMS: AgreementTerms = {
  asset: USDC, seller: SELLER, amount: 1_000_000_000n, trancheBps: [5000, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  acceptBy: 1_800_000_000n, deliveryDeadline: 1_800_604_800n, reclaimGrace: 86_400, reviewWindow: 259_200,
  startLongstop: 0, extensionSecs: 259_200, silentLongstop: 1_123_200, reviewStarts: 0, maxExtensions: 1,
  finalRelease: 0, silenceOutcome: 0, partialBps: 0, fallbackBps: 5000, parts: 0, partEvery: 0, cancelFeeBps: 0,
  sellerStake: 0n, verifier: Z20, checkPolicy: Z32, agreementHash: `0x${'ab'.repeat(32)}`,
};
const ID = agreementDealId({ chainId: CHAIN, escrow: ESCROW, buyer: BUYER, salt: SALT });

function blank(): DealV3View {
  return {
    state: DEAL_STATE.None, buyer: Z20, seller: Z20, buyerId: Z20, sellerId: Z20, count: 0, paid: 0, extUsed: 0, revision: 0,
    checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false, deliveredAt: 0n, reviewStartAt: 0n,
    reviewEnd: 0n, deadline: 0n, disputedAt: 0n, proposedAt: 0n, proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n,
    feeReleased: 0n, reserved: 0n, termsHash: Z32,
  };
}

function harness() {
  const views = new Map<string, DealV3View>();
  const owed = new Map<string, bigint>();
  const splits = new Map<string, { active: boolean; sellerBps: number }>();
  const events: Array<{ type: string; jobId?: string; payload?: Record<string, unknown> }> = [];
  const calls: Array<{ walletId: string; sig: string; params: unknown[] }> = [];
  const receipts = new Map<string, Array<{ name: string; jobId: Hex; args: Record<string, unknown> }>>();
  const queue: Array<(() => void) | 'revert'> = [];
  let tx = 0;
  const ports: AgreementEscrowPorts = {
    address: ESCROW,
    chainId: CHAIN,
    async execute(input) {
      calls.push({ walletId: input.walletId, sig: input.abiFunctionSignature, params: input.abiParameters });
      const txHash = `0x${(++tx).toString(16).padStart(64, '0')}`;
      const step = queue.shift();
      if (typeof step === 'function') step();
      return { txHash };
    },
    async readView(id) { return views.get(id) ?? blank(); },
    async readTerms() { return TERMS; },
    async readOwed(asset, who) { return owed.get(`${asset}:${who}`.toLowerCase()) ?? 0n; },
    async readSplit(id) { return splits.get(id) ?? { active: false, sellerBps: 0 }; },
    async receiptEvents(txHash) { return receipts.get(txHash) ?? []; },
    emit(e) { events.push(e); },
  };
  const set = (over: Partial<DealV3View>) => views.set(ID, { ...(views.get(ID) ?? blank()), ...over });
  return {
    ports, views, owed, splits, events, calls, receipts, set,
    next: (fn: () => void) => queue.push(fn),
    revert: () => queue.push('revert'),
    nextTx: () => `0x${(tx + 1).toString(16).padStart(64, '0')}`,
  };
}

const live = (h: ReturnType<typeof harness>, over: Partial<DealV3View> = {}) =>
  h.set({ state: DEAL_STATE.Funded, buyer: BUYER, seller: SELLER, count: 2, termsHash: agreementTermsHash(TERMS), ...over });

test('fund_sends_the_tuple_and_proves_funded', async () => {
  const h = harness();
  const escrow = createAgreementEscrow(h.ports);
  h.receipts.set(h.nextTx(), [{ name: 'DealFunded', jobId: ID, args: { buyer: BUYER } }]);
  h.next(() => live(h));
  const r = await escrow.fund({ walletId: 'buyer-agent', buyer: BUYER, salt: SALT, terms: TERMS });
  assert.equal(r.jobId, ID);
  assert.equal(r.termsHash, agreementTermsHash(TERMS));
  assert.match(h.calls[0]!.sig, /^fund\(bytes32,\(address,address,uint128,uint16\[12\],/);
  assert.equal(h.calls[0]!.params[0], SALT);
  assert.equal((h.calls[0]!.params[1] as unknown[]).length, 24);
  assert.ok(h.events.some((e) => e.type === 'escrow.funded' && e.jobId === ID));
});

test('fund_throws_EscrowProofError_when_the_read_does_not_move', async () => {
  const h = harness();
  const escrow = createAgreementEscrow(h.ports);
  h.receipts.set(h.nextTx(), [{ name: 'DealFunded', jobId: ID, args: { buyer: BUYER } }]);
  h.revert();
  await assert.rejects(escrow.fund({ walletId: 'w', buyer: BUYER, salt: SALT, terms: TERMS }), EscrowProofError);
  assert.equal(h.events.length, 0);
  const h2 = harness();
  h2.revert();
  await assert.rejects(createAgreementEscrow(h2.ports).fund({ walletId: 'w', buyer: BUYER, salt: SALT, terms: TERMS }), EscrowProofError);
});

test('fund_under_another_id_reports_the_real_id', async () => {
  const h = harness();
  const other = `0x${'99'.repeat(32)}` as Hex;
  h.receipts.set(h.nextTx(), [{ name: 'DealFunded', jobId: other, args: { buyer: `0x${'77'.repeat(20)}` } }]);
  await assert.rejects(
    createAgreementEscrow(h.ports).fund({ walletId: 'w', buyer: BUYER, salt: SALT, terms: TERMS }),
    (err: unknown) => err instanceof EscrowProofError && err.details.actualJobId === other,
  );
});

test('accept_proves_accepted', async () => {
  const h = harness();
  live(h);
  h.next(() => h.set({ state: DEAL_STATE.Accepted }));
  await createAgreementEscrow(h.ports).accept({ walletId: 'seller-agent', jobId: ID, termsHash: agreementTermsHash(TERMS) });
  assert.deepEqual(h.calls[0]!.params, [ID, agreementTermsHash(TERMS)]);
  assert.ok(h.events.some((e) => e.type === 'escrow.accepted'));
  const h2 = harness();
  live(h2);
  h2.revert();
  await assert.rejects(createAgreementEscrow(h2.ports).accept({ walletId: 's', jobId: ID, termsHash: agreementTermsHash(TERMS) }), EscrowProofError);
});

test('release_emits_paid_and_settled_on_the_last_tranche', async () => {
  const h = harness();
  const escrow = createAgreementEscrow(h.ports);
  live(h, { state: DEAL_STATE.Accepted, paid: 1 });
  h.next(() => h.set({ paid: 2, state: DEAL_STATE.Settled, released: 990_000_000n, feeReleased: 10_000_000n }));
  const r = await escrow.release({ walletId: 'buyer-agent', jobId: ID });
  assert.equal(r.settled, true);
  assert.deepEqual(h.events.map((e) => e.type), ['escrow.milestone.released', 'escrow.settled']);
});

test('a_payout_reports_the_seller_amount_it_paid', async () => {
  const h = harness();
  live(h, { state: DEAL_STATE.Accepted, paid: 0, released: 0n });
  h.next(() => h.set({ paid: 1, released: 495_000_000n }));
  await createAgreementEscrow(h.ports).release({ walletId: 'buyer-agent', jobId: ID });
  assert.equal(h.events[0]!.payload?.sellerMicros, '495000000');
});

test('claim_marks_by_claim', async () => {
  const h = harness();
  live(h, { state: DEAL_STATE.Accepted });
  h.next(() => h.set({ paid: 1 }));
  await createAgreementEscrow(h.ports).claim({ walletId: 'seller-agent', jobId: ID });
  assert.equal(h.calls[0]!.sig, 'claim(bytes32)');
  assert.equal(h.events[0]!.payload?.byClaim, true);
});

test('dispute_then_propose_then_execute_moves_to_split_view', async () => {
  const h = harness();
  const escrow = createAgreementEscrow(h.ports);
  live(h, { state: DEAL_STATE.Accepted });
  h.next(() => h.set({ state: DEAL_STATE.Disputed, disputedAt: 10n }));
  await escrow.dispute({ walletId: 'buyer-agent', jobId: ID, clauseHash: `0x${'cc'.repeat(32)}` });
  h.next(() => h.set({ proposal: true, proposedBps: 5000 }));
  await escrow.proposeRuling({ walletId: 'arbiter', jobId: ID, sellerBps: 5000, rulingHash: `0x${'dd'.repeat(32)}` });
  h.next(() => h.set({ state: DEAL_STATE.Split }));
  await escrow.executeRuling({ walletId: 'anyone', jobId: ID });
  assert.deepEqual(h.calls.map((c) => c.sig), ['dispute(bytes32,bytes32)', 'proposeRuling(bytes32,uint16,bytes32)', 'executeRuling(bytes32)']);
  assert.ok(h.events.some((e) => e.type === 'escrow.resolved'));
});

test('a_ruling_on_an_earlier_tranche_returns_the_deal_to_accepted_and_reports_the_seller_share', async () => {
  const h = harness();
  const escrow = createAgreementEscrow(h.ports);
  live(h, { state: DEAL_STATE.Disputed, proposal: true, proposedBps: 10_000 });
  h.receipts.set(h.nextTx(), [{ name: 'TrancheRuled', jobId: ID, args: { dealId: ID, tranche: 0, sellerBps: 10_000, toSeller: 495_000_000n, toBuyer: 0n } }]);
  h.next(() => h.set({ state: DEAL_STATE.Accepted, proposal: false, paid: 1 }));
  const { txHash } = await escrow.executeRuling({ walletId: 'anyone', jobId: ID, dealKey: 'deal-1' });
  const paid = h.events.find((e) => e.type === 'escrow.seller.paid');
  assert.deepEqual(paid?.payload, { sellerMicros: '495000000', payoutKey: `ruling:${txHash}`, txHash });
  assert.equal(paid?.jobId, 'deal-1');
});

test('apply_fallback_closes_the_dispute_and_reports_the_seller_share', async () => {
  const h = harness();
  live(h, { state: DEAL_STATE.Disputed, escalated: true });
  h.receipts.set(h.nextTx(), [{ name: 'SplitSettled', jobId: ID, args: { dealId: ID, sellerBps: 5000, toSeller: 497_500_000n, toBuyer: 502_500_000n } }]);
  h.next(() => h.set({ state: DEAL_STATE.Split }));
  await createAgreementEscrow(h.ports).applyFallback({ walletId: 'anyone', jobId: ID });
  assert.equal(h.calls[0]!.sig, 'applyFallback(bytes32)');
  assert.equal(h.events.find((e) => e.type === 'escrow.seller.paid')?.payload?.sellerMicros, '497500000');
});

test('an_agreed_split_reports_the_seller_share_from_the_receipt', async () => {
  const h = harness();
  live(h, { state: DEAL_STATE.Accepted });
  h.receipts.set(h.nextTx(), [{ name: 'SplitSettled', jobId: ID, args: { dealId: ID, sellerBps: 3000, toSeller: 297_000_000n, toBuyer: 703_000_000n } }]);
  h.next(() => h.set({ state: DEAL_STATE.Split }));
  await createAgreementEscrow(h.ports).acceptSplit({ walletId: 'seller-agent', jobId: ID, sellerBps: 3000 });
  assert.equal(h.events.find((e) => e.type === 'escrow.seller.paid')?.payload?.sellerMicros, '297000000');
});

test('escalate_sets_escalated', async () => {
  const h = harness();
  live(h, { state: DEAL_STATE.Disputed });
  h.next(() => h.set({ escalated: true }));
  await createAgreementEscrow(h.ports).escalate({ walletId: 'seller-agent', jobId: ID });
  assert.equal(h.calls[0]!.sig, 'escalate(bytes32)');
});

test('withdraw_owed_proves_the_balance_dropped', async () => {
  const h = harness();
  h.owed.set(`${USDC}:${SELLER}`.toLowerCase(), 5_000_000n);
  h.next(() => h.owed.set(`${USDC}:${SELLER}`.toLowerCase(), 0n));
  const r = await createAgreementEscrow(h.ports).withdrawOwed({ walletId: 'seller-agent', asset: USDC, owner: SELLER });
  assert.equal(r.amount, 5_000_000n);
  assert.deepEqual(h.calls[0], { walletId: 'seller-agent', sig: 'withdrawOwed(address)', params: [USDC] });
  const h2 = harness();
  h2.owed.set(`${USDC}:${SELLER}`.toLowerCase(), 5_000_000n);
  h2.revert();
  await assert.rejects(createAgreementEscrow(h2.ports).withdrawOwed({ walletId: 's', asset: USDC, owner: SELLER }), EscrowProofError);
});

test('ruled_and_longstopped_read_as_split', () => {
  const raw = (state: number) => ({
    deal: { state, count: 2, paid: 1, extUsed: 0, checkPassed: false, lateMark: false, revision: 1, deadline: 9n, deliveredAt: 5n, reviewStartAt: 5n, reviewEnd: 8n, sellerNet: 995n, feeTotal: 10n, released: 1n, feeReleased: 0n, termsHash: Z32 },
    account: { payer: BUYER, payerId: 7n },
    dispute: { openedAt: 6n, proposed: true, escalated: true, proposedBps: 4000, proposedAt: 7n },
    panel: { reviewer: SENIOR },
    terms: { seller: SELLER, sellerStake: 25n },
    seniorSafe: SENIOR,
  });
  for (const s of [AGREEMENT_STATE.Ruled, AGREEMENT_STATE.Longstopped]) assert.equal(toDealView(raw(s)).state, DEAL_STATE.Split);
  for (const s of [0, 1, 2, 3, 4, 5, 6, 7]) assert.equal(toDealView(raw(s)).state, s);
  const v = toDealView(raw(AGREEMENT_STATE.Accepted));
  assert.equal(v.buyer, BUYER);
  assert.equal(v.seller, SELLER);
  assert.equal(v.disputedAt, 6n);
  assert.equal(v.proposal, true);
  assert.equal(v.proposedBps, 4000);
  assert.equal(v.escalated, true);
  assert.equal(v.senior, true);
  assert.equal(v.reserved, 25n);
  assert.equal(toDealView({ ...raw(2), panel: { reviewer: REVIEW } }).senior, false);
});
