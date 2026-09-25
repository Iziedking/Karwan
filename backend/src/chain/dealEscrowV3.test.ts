import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDealEscrowV3,
  DEAL_STATE,
  EscrowProofError,
  type DealEscrowV3Ports,
  type DealV3View,
} from './dealEscrowV3.js';
import { dealIdV3, dealTermsHash, type DealTermsV3 } from './dealTermsV3.js';

type Hex = `0x${string}`;

const ESCROW = `0x${'11'.repeat(20)}` as Hex;
const BUYER = `0x${'22'.repeat(20)}` as Hex;
const SELLER = `0x${'33'.repeat(20)}` as Hex;
const SALT = `0x${'44'.repeat(32)}` as Hex;
const CHAIN = 5042002;

const TERMS: DealTermsV3 = {
  seller: SELLER,
  amount: 1_000_000_000n,
  pcts: [50, 50, 0, 0, 0],
  reservationBps: 0,
  deliveryDeadline: 1_800_864_000n,
  reclaimGrace: 86_400,
  reviewWindow: 300,
  reviewStarts: 0,
  startLongstop: 0,
  maxExtensions: 1,
  extensionSecs: 300,
  finalRelease: 0,
  silenceOutcome: 0,
  silentLongstop: 605_400,
  checkPolicy: `0x${'00'.repeat(32)}`,
  agreementHash: `0x${'ab'.repeat(32)}`,
};
const ID = dealIdV3({ chainId: CHAIN, escrow: ESCROW, buyer: BUYER, salt: SALT });

function blank(): DealV3View {
  return {
    state: DEAL_STATE.None,
    buyer: `0x${'00'.repeat(20)}`,
    seller: `0x${'00'.repeat(20)}`,
    buyerId: `0x${'00'.repeat(20)}`,
    sellerId: `0x${'00'.repeat(20)}`,
    count: 0,
    paid: 0,
    extUsed: 0,
    revision: 0,
    checkPassed: false,
    lateMark: false,
    escalated: false,
    proposal: false,
    senior: false,
    deliveredAt: 0n,
    reviewStartAt: 0n,
    reviewEnd: 0n,
    deadline: 0n,
    disputedAt: 0n,
    proposedAt: 0n,
    proposedBps: 0,
    sellerNet: 0n,
    feeTotal: 0n,
    released: 0n,
    feeReleased: 0n,
    reserved: 0n,
    termsHash: `0x${'00'.repeat(32)}`,
  };
}

/// A fake chain: each submitted call applies `effect` to the stored deal unless
/// the test marks the next call as an inner revert (Circle says COMPLETE, the
/// chain did not change).
function harness() {
  const deals = new Map<string, DealV3View>();
  const owed = new Map<string, bigint>();
  const splits = new Map<string, { active: boolean; sellerBps: number }>();
  const events: Array<{ type: string; jobId?: string }> = [];
  const calls: Array<{ walletId: string; sig: string; params: unknown[] }> = [];
  const receiptEvents = new Map<string, Array<{ name: string; jobId: Hex; args: Record<string, unknown> }>>();
  // One entry per submitted call: an effect to apply, or 'revert' for Circle
  // COMPLETE with no state change. An empty queue behaves like 'revert'.
  const queue: Array<(() => void) | 'revert'> = [];
  let txCount = 0;

  const ports: DealEscrowV3Ports = {
    address: ESCROW,
    chainId: CHAIN,
    async execute(input) {
      calls.push({ walletId: input.walletId, sig: input.abiFunctionSignature, params: input.abiParameters });
      const txHash = `0x${(++txCount).toString(16).padStart(64, '0')}` as Hex;
      const step = queue.shift();
      if (typeof step === 'function') step();
      return { txHash };
    },
    async readDeal(id) {
      return deals.get(id) ?? blank();
    },
    async readOwed(addr) {
      return owed.get(addr.toLowerCase()) ?? 0n;
    },
    async readSplit(id) {
      return splits.get(id) ?? { active: false, sellerBps: 0 };
    },
    async receiptEvents(txHash) {
      return receiptEvents.get(txHash) ?? [];
    },
    emit(e) {
      events.push(e);
    },
  };

  return {
    ports,
    deals,
    owed,
    splits,
    events,
    calls,
    receiptEvents,
    nextEffect(fn: () => void) {
      queue.push(fn);
    },
    nextInnerRevert() {
      queue.push('revert');
    },
    nextTxHash(): Hex {
      return `0x${(txCount + 1).toString(16).padStart(64, '0')}` as Hex;
    },
  };
}

function funded(h: ReturnType<typeof harness>, over: Partial<DealV3View> = {}) {
  h.deals.set(ID, {
    ...blank(),
    state: DEAL_STATE.Funded,
    buyer: BUYER,
    seller: SELLER,
    count: 2,
    termsHash: dealTermsHash(TERMS),
    ...over,
  });
}

// ------------------------------- funding --------------------------------

test('fund: the deal id comes from the receipt and matches the one computed off-chain', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  h.receiptEvents.set(h.nextTxHash(), [
    { name: 'DealFunded', jobId: ID, args: { buyer: BUYER, termsHash: dealTermsHash(TERMS) } },
  ]);
  h.nextEffect(() => funded(h));
  const r = await escrow.fund({ walletId: 'buyer-w', buyer: BUYER, salt: SALT, terms: TERMS });
  assert.equal(r.jobId, ID);
  assert.match(h.calls[0].sig, /^fund\(bytes32,\(address,uint128,uint8\[5\],/);
  assert.deepEqual(h.calls[0].params[0], SALT);
  assert.ok(h.events.some((e) => e.type === 'escrow.funded' && e.jobId === ID));
});

test('fund: COMPLETE without a DealFunded event is an inner revert and emits nothing', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  h.nextInnerRevert();
  await assert.rejects(
    escrow.fund({ walletId: 'buyer-w', buyer: BUYER, salt: SALT, terms: TERMS }),
    EscrowProofError,
  );
  assert.equal(h.events.length, 0);
});

test('fund: money landed under a different id (signer drift) is reported with the real id', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  const other = `0x${'99'.repeat(32)}` as Hex;
  h.receiptEvents.set(h.nextTxHash(), [
    { name: 'DealFunded', jobId: other, args: { buyer: `0x${'77'.repeat(20)}`, termsHash: dealTermsHash(TERMS) } },
  ]);
  await assert.rejects(
    escrow.fund({ walletId: 'buyer-w', buyer: BUYER, salt: SALT, terms: TERMS }),
    (err: unknown) => err instanceof EscrowProofError && err.details.actualJobId === other,
  );
  assert.equal(h.events.length, 0);
});

test('fund: terms on-chain that differ from the ones we built are refused', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  h.receiptEvents.set(h.nextTxHash(), [
    { name: 'DealFunded', jobId: ID, args: { buyer: BUYER, termsHash: `0x${'55'.repeat(32)}` } },
  ]);
  h.nextEffect(() => funded(h, { termsHash: `0x${'55'.repeat(32)}` }));
  await assert.rejects(
    escrow.fund({ walletId: 'buyer-w', buyer: BUYER, salt: SALT, terms: TERMS }),
    EscrowProofError,
  );
});

// ------------------------------ lifecycle -------------------------------

test('accept: proven by the Accepted state; an inner revert throws and emits nothing', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  funded(h);
  h.nextInnerRevert();
  await assert.rejects(escrow.accept({ walletId: 'seller-w', jobId: ID, termsHash: dealTermsHash(TERMS) }), EscrowProofError);
  assert.equal(h.events.length, 0);

  h.nextEffect(() => funded(h, { state: DEAL_STATE.Accepted }));
  await escrow.accept({ walletId: 'seller-w', jobId: ID, termsHash: dealTermsHash(TERMS) });
  assert.deepEqual(h.calls.at(-1)?.params, [ID, dealTermsHash(TERMS)]);
  assert.ok(h.events.some((e) => e.type === 'escrow.accepted'));
});

test('markDelivered: proven by a new delivery revision', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  funded(h, { state: DEAL_STATE.Accepted, revision: 1 });
  h.nextInnerRevert();
  await assert.rejects(escrow.markDelivered({ walletId: 's', jobId: ID, proofHash: SALT }), EscrowProofError);
  h.nextEffect(() => funded(h, { state: DEAL_STATE.Accepted, revision: 2, deliveredAt: 1n }));
  const r = await escrow.markDelivered({ walletId: 's', jobId: ID, proofHash: SALT });
  assert.equal(r.revision, 2);
});

test('release and claim: proven by the paid counter; settling the last one emits settled', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  funded(h, { state: DEAL_STATE.Accepted, paid: 0 });
  h.nextInnerRevert();
  await assert.rejects(escrow.release({ walletId: 'b', jobId: ID }), EscrowProofError);

  h.nextEffect(() => funded(h, { state: DEAL_STATE.Accepted, paid: 1 }));
  await escrow.release({ walletId: 'b', jobId: ID });
  h.nextEffect(() => funded(h, { state: DEAL_STATE.Settled, paid: 2 }));
  await escrow.claim({ walletId: 's', jobId: ID });
  assert.deepEqual(
    h.events.map((e) => e.type),
    ['escrow.milestone.released', 'escrow.milestone.released', 'escrow.settled'],
  );
  assert.deepEqual(h.calls.at(-1)?.params, [ID, `0x${'00'.repeat(20)}`]);
});

test('reclaim, cancel, dispute and lapse are each proven by their end state', async () => {
  const cases: Array<[string, DealV3View['state'], DealV3View['state'], (e: ReturnType<typeof createDealEscrowV3>) => Promise<unknown>]> = [
    ['reclaim', DEAL_STATE.Accepted, DEAL_STATE.Reclaimed, (e) => e.reclaim({ walletId: 'b', jobId: ID })],
    ['cancelUnaccepted', DEAL_STATE.Funded, DEAL_STATE.Refunded, (e) => e.cancelUnaccepted({ walletId: 'b', jobId: ID })],
    ['dispute', DEAL_STATE.Accepted, DEAL_STATE.Disputed, (e) => e.dispute({ walletId: 'b', jobId: ID, reasonHash: SALT })],
    ['lapseDispute', DEAL_STATE.Disputed, DEAL_STATE.Accepted, (e) => e.lapseDispute({ walletId: 'b', jobId: ID })],
    ['executeRuling', DEAL_STATE.Disputed, DEAL_STATE.Split, (e) => e.executeRuling({ walletId: 'b', jobId: ID })],
  ];
  for (const [name, from, to, run] of cases) {
    const h = harness();
    const escrow = createDealEscrowV3(h.ports);
    funded(h, { state: from });
    h.nextInnerRevert();
    await assert.rejects(run(escrow), EscrowProofError, `${name} inner revert`);
    h.nextEffect(() => funded(h, { state: to }));
    await run(escrow);
    assert.ok(h.calls.at(-1)?.sig.startsWith(`${name}(`), name);
  }
});

test('settleBySplit: propose from one side, accept from the other, proven by the Split state', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  funded(h, { state: DEAL_STATE.Disputed });
  h.nextEffect(() => h.splits.set(ID, { active: true, sellerBps: 0 }));
  h.nextInnerRevert();
  await assert.rejects(
    escrow.settleBySplit({ proposerWalletId: 'b', acceptorWalletId: 's', jobId: ID, sellerBps: 0 }),
    EscrowProofError,
    'the accept landed without settling',
  );

  const h2 = harness();
  const e2 = createDealEscrowV3(h2.ports);
  funded(h2, { state: DEAL_STATE.Accepted });
  h2.nextEffect(() => h2.splits.set(ID, { active: true, sellerBps: 2500 }));
  h2.nextEffect(() => funded(h2, { state: DEAL_STATE.Split }));
  await e2.settleBySplit({ proposerWalletId: 'b', acceptorWalletId: 's', jobId: ID, sellerBps: 2500 });
  assert.deepEqual(h2.calls.map((c) => c.walletId), ['b', 's']);
  assert.deepEqual(h2.calls[1].params, [ID, '2500']);
});

test('proposeRuling: proven by the stored proposal and its basis points', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  funded(h, { state: DEAL_STATE.Disputed });
  h.nextEffect(() => funded(h, { state: DEAL_STATE.Disputed, proposal: true, proposedBps: 5000 }));
  await assert.rejects(
    escrow.proposeRuling({ walletId: 'arb', jobId: ID, sellerBps: 10_000, rulingHash: SALT }),
    EscrowProofError,
    'a different number on-chain is not our proposal',
  );
  h.nextEffect(() => funded(h, { state: DEAL_STATE.Disputed, proposal: true, proposedBps: 10_000 }));
  await escrow.proposeRuling({ walletId: 'arb', jobId: ID, sellerBps: 10_000, rulingHash: SALT });
});

test('attestCheck: a pass is proven by state, a fail by its CheckAttested event', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  funded(h, { state: DEAL_STATE.Accepted, revision: 3, deliveredAt: 1n });
  h.nextEffect(() => funded(h, { state: DEAL_STATE.Accepted, revision: 3, deliveredAt: 1n, checkPassed: true }));
  await escrow.attestCheck({ walletId: 'g', jobId: ID, revision: 3, pass: true, evidenceHash: SALT });

  await assert.rejects(
    escrow.attestCheck({ walletId: 'g', jobId: ID, revision: 3, pass: false, evidenceHash: SALT }),
    EscrowProofError,
    'no event, no proof',
  );
  h.receiptEvents.set(h.nextTxHash(), [{ name: 'CheckAttested', jobId: ID, args: { revision: 3, pass: false } }]);
  await escrow.attestCheck({ walletId: 'g', jobId: ID, revision: 3, pass: false, evidenceHash: SALT });
});

test('withdrawOwed: proven when the owed balance reaches zero', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  h.owed.set(SELLER.toLowerCase(), 5_000_000n);
  h.nextInnerRevert();
  await assert.rejects(escrow.withdrawOwed({ walletId: 's', owner: SELLER }), EscrowProofError);
  h.nextEffect(() => h.owed.set(SELLER.toLowerCase(), 0n));
  const r = await escrow.withdrawOwed({ walletId: 's', owner: SELLER });
  assert.equal(r.amount, 5_000_000n);
});

test('every function signature sent to Circle exists in the pinned v3 ABI', async () => {
  const { readFileSync } = await import('node:fs');
  const { toFunctionSignature } = await import('viem');
  const { dealEscrowV3Abi } = await import('./abis/dealEscrowV3.js');
  const known = new Set(
    dealEscrowV3Abi.filter((x) => x.type === 'function').map((f) => toFunctionSignature(f as never)),
  );
  const source = readFileSync(new URL('./dealEscrowV3.ts', import.meta.url), 'utf8');
  const used = [...source.matchAll(/'([a-zA-Z]+\([a-z0-9,\[\]()]*\))'/g)].map((m) => m[1]);
  assert.ok(used.length >= 15, `found ${used.length} signatures`);
  for (const sig of used) assert.ok(known.has(sig), `${sig} is not in the ABI`);
});

test('events are keyed to the deal id in Karwan, so share links and timelines keep working', async () => {
  const h = harness();
  const escrow = createDealEscrowV3(h.ports);
  h.receiptEvents.set(h.nextTxHash(), [
    { name: 'DealFunded', jobId: ID, args: { buyer: BUYER, termsHash: dealTermsHash(TERMS) } },
  ]);
  h.nextEffect(() => funded(h));
  await escrow.fund({ walletId: 'b', buyer: BUYER, salt: SALT, terms: TERMS, dealKey: 'deal-123' });
  h.nextEffect(() => funded(h, { state: DEAL_STATE.Accepted }));
  await escrow.accept({ walletId: 's', jobId: ID, termsHash: dealTermsHash(TERMS), dealKey: 'deal-123' });
  assert.deepEqual(h.events.map((e) => e.jobId), ['deal-123', 'deal-123']);
});
