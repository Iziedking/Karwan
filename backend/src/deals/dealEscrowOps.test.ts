import assert from 'node:assert/strict';
import test from 'node:test';

// contracts.js validates the contract env at import; CI provides the same dummies.
process.env.KARWAN_JOBBOARD_ADDR ??= '0x0000000000000000000000000000000000000001';
process.env.KARWAN_ESCROW_ADDR ??= '0x0000000000000000000000000000000000000002';
process.env.KARWAN_REPUTATION_ADDR ??= '0x0000000000000000000000000000000000000003';
process.env.KARWAN_VAULT_ADDR ??= '0x0000000000000000000000000000000000000004';
process.env.USDC_ADDR ??= '0x0000000000000000000000000000000000000006';

const { ESCROW_STATE } = await import('../chain/contracts.js');
const { createDealEscrowV3, DEAL_STATE } = await import('../chain/dealEscrowV3.js');
const { dealTermsHash } = await import('../chain/dealTermsV3.js');
const { accountFromV3, createDealEscrowOps, NothingDelivered } = await import('./dealEscrowOps.js');
const { storeTerms } = await import('./fundDirectV3.js');
const { createAgreementEscrow } = await import('../chain/agreementEscrow.js');
const { IdentityNeeded } = await import('../identity/suiteIdentity.js');
const { agreementTermsHash, storeAgreementTerms } = await import('../chain/agreementTerms.js');

type Hex = `0x${string}`;
type View = import('../chain/dealEscrowV3.js').DealV3View;

const ESCROW = `0x${'11'.repeat(20)}` as Hex;
const ID = `0x${'aa'.repeat(32)}` as Hex;
const TERMS = {
  seller: `0x${'33'.repeat(20)}` as Hex,
  amount: 1_000_000_000n,
  pcts: [40, 60, 0, 0, 0] as [number, number, number, number, number],
  reservationBps: 5000,
  deliveryDeadline: 1_800_864_000n,
  reclaimGrace: 86_400,
  reviewWindow: 300,
  reviewStarts: 1,
  startLongstop: 604_800,
  maxExtensions: 1,
  extensionSecs: 300,
  finalRelease: 0,
  silenceOutcome: 0,
  silentLongstop: 605_400,
  checkPolicy: `0x${'00'.repeat(32)}` as Hex,
  agreementHash: `0x${'ab'.repeat(32)}` as Hex,
};

function view(over: Partial<View> = {}): View {
  const z = `0x${'00'.repeat(20)}` as Hex;
  return {
    state: DEAL_STATE.Accepted, buyer: `0x${'22'.repeat(20)}`, seller: TERMS.seller, buyerId: z, sellerId: z,
    count: 2, paid: 0, extUsed: 0, revision: 1, checkPassed: false, lateMark: false, escalated: false,
    proposal: false, senior: false, deliveredAt: 0n, reviewStartAt: 0n, reviewEnd: 0n, deadline: 1_800_864_000n,
    disputedAt: 0n, proposedAt: 0n, proposedBps: 0, sellerNet: 992_500_000n, feeTotal: 15_000_000n,
    released: 0n, feeReleased: 0n, reserved: 500_000_000n, termsHash: dealTermsHash(TERMS), ...over,
  };
}

const V3_DEAL = {
  jobId: 'deal-1',
  escrowVersion: 'v3' as const,
  escrowDealId: ID,
  escrowTerms: storeTerms(TERMS),
  escrowTermsHash: dealTermsHash(TERMS),
};

const TERMS_A = {
  asset: '0x3600000000000000000000000000000000000000' as Hex, seller: TERMS.seller, amount: 1_000_000_000n,
  trancheBps: [5000, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], acceptBy: 1_800_000_000n, deliveryDeadline: 1_800_604_800n,
  reclaimGrace: 86_400, reviewWindow: 259_200, startLongstop: 0, extensionSecs: 259_200, silentLongstop: 1_123_200,
  reviewStarts: 0, maxExtensions: 1, finalRelease: 0, silenceOutcome: 0, partialBps: 0, fallbackBps: 5000, parts: 0,
  partEvery: 0, cancelFeeBps: 0, sellerStake: 0n, verifier: `0x${'00'.repeat(20)}` as Hex, checkPolicy: `0x${'00'.repeat(32)}` as Hex,
  agreementHash: `0x${'ab'.repeat(32)}` as Hex,
};
const SUITE_ID = `0x${'bb'.repeat(32)}` as Hex;
const SUITE_DEAL = {
  jobId: 'deal-s',
  escrowVersion: 'suite' as const,
  escrowDealId: SUITE_ID,
  escrowTerms: storeAgreementTerms(TERMS_A),
  escrowTermsHash: agreementTermsHash(TERMS_A),
};

function setup(initial: View = view(), opts: { sellerRecord?: boolean } = {}) {
  let current = initial;
  const v2Calls: string[] = [];
  const v3Calls: Array<{ name: string; walletId: string }> = [];
  const suiteCalls: Array<{ name: string; walletId: string; params: unknown[] }> = [];
  const warnings: string[] = [];
  const checks: Array<{ revision: number; pass: boolean }> = [];
  let split = { active: false, sellerBps: 0 };
  const escrow = createDealEscrowV3({
    address: ESCROW,
    chainId: 5042002,
    async execute(input) {
      const name = input.abiFunctionSignature.split('(')[0];
      v3Calls.push({ name, walletId: input.walletId });
      if (name === 'release' || name === 'claim') current = { ...current, paid: current.paid + 1 };
      if (name === 'startReview') current = { ...current, reviewStartAt: 1n };
      if (name === 'markDelivered') current = { ...current, revision: current.revision + 1, deliveredAt: 5n };
      if (name === 'attestCheck') current = { ...current, checkPassed: true };
      return { txHash: `0x${'01'.repeat(32)}` };
    },
    readDeal: async () => current,
    readOwed: async () => 0n,
    readSplit: async () => ({ active: false, sellerBps: 0 }),
    readHeld: async () => false,
    receiptEvents: async () => [],
    emit: () => undefined,
  });
  const record = (name: string) => async () => {
    v2Calls.push(name);
    return '0xv2';
  };
  const suiteEscrow = createAgreementEscrow({
    address: `0x${'55'.repeat(20)}` as Hex,
    chainId: 5042002,
    async execute(input) {
      const name = input.abiFunctionSignature.split('(')[0]!;
      suiteCalls.push({ name, walletId: input.walletId, params: input.abiParameters });
      if (name === 'accept') current = { ...current, state: DEAL_STATE.Accepted };
      if (name === 'release' || name === 'claim') current = { ...current, paid: current.paid + 1 };
      if (name === 'dispute') current = { ...current, state: DEAL_STATE.Disputed };
      if (name === 'proposeSplit') split = { active: true, sellerBps: Number(input.abiParameters[1]) };
      if (name === 'acceptSplit') current = { ...current, state: DEAL_STATE.Split };
      return { txHash: `0x${'02'.repeat(32)}` };
    },
    readView: async () => current,
    readTerms: async () => TERMS_A,
    readOwed: async () => 0n,
    readSplit: async () => split,
    receiptEvents: async () => [],
    emit: () => undefined,
  });
  const ops = createDealEscrowOps({
    suite: {
      escrow: suiteEscrow,
      readView: async () => current,
      readReviewEnd: async () => 888n,
      requireIdentity: async () => {
        if (opts.sellerRecord === false) throw new IdentityNeeded('record_setup_needed');
      },
      submitCheck: async (_id, revision, pass) => {
        checks.push({ revision, pass });
        return '0xcheck';
      },
    },
    v3: escrow,
    readV3: async () => current,
    readV3ReviewEnd: async () => 777n,
    guardianWalletId: 'guardian-w',
    v2OnChainClock: false,
    v2: {
      readEscrow: async () => ({ state: ESCROW_STATE.Accepted, milestonesReleased: 0 }) as never,
      invalidate: () => undefined,
      accept: record('accept'),
      markDelivered: record('markDelivered'),
      release: record('release'),
      claim: record('claim'),
      extendDeadline: record('extendDeadline'),
      reclaim: record('reclaim'),
      finalizeIfSettled: async () => false,
      attest: record('attest'),
      dispute: record('dispute'),
      lapseDispute: record('lapseDispute'),
      mutualCancel: async () => {
        v2Calls.push('mutualCancel');
        return { proposeTxHash: '0xv2', acceptTxHash: '0xv2' };
      },
      hold: record('hold'),
      releaseHold: record('releaseHold'),
    },
    warn: (_c, message) => {
      warnings.push(message);
    },
  });
  return { ops, v2Calls, v3Calls, suiteCalls, warnings, checks, get current() { return current; } };
}

test('a v3 deal reads back in the v2 account shape the routes use', () => {
  const a = accountFromV3(view({ paid: 1, deliveredAt: 9n }), storeTerms(TERMS), 777n);
  assert.equal(a.state, ESCROW_STATE.Accepted);
  assert.equal(a.dealAmount, 1_000_000_000n);
  assert.deepEqual(a.milestonePcts, [40, 60]);
  assert.equal(a.milestonesReleased, 1);
  assert.equal(a.reservationBps, 5000);
  assert.equal(a.claimDeadline, 777n);
  assert.equal(a.deliveredAt, 9n);
  assert.equal(a.version, 'v3');
});

test('every v3 end state maps to a v2 state the routes treat as final', () => {
  const map = (state: View['state']) => accountFromV3(view({ state }), storeTerms(TERMS), 0n).state;
  assert.equal(map(DEAL_STATE.Reclaimed), ESCROW_STATE.Refunded);
  assert.equal(map(DEAL_STATE.Split), ESCROW_STATE.Settled);
  assert.equal(map(DEAL_STATE.Disputed), ESCROW_STATE.Disputed);
  assert.equal(map(DEAL_STATE.Funded), ESCROW_STATE.Funded);
});

test('a v2 deal (or one with no version) goes to the v2 wrappers only', async () => {
  const s = setup();
  const v2Deal = { jobId: 'deal-2' };
  await s.ops.accept(v2Deal, 'seller-w');
  await s.ops.release(v2Deal, 0, 'buyer-w');
  await s.ops.claim({ ...v2Deal, escrowVersion: 'v2' }, 0, 'seller-w');
  assert.deepEqual(s.v2Calls, ['accept', 'release', 'claim']);
  assert.deepEqual(s.v3Calls, []);
});

test('a v3 deal goes to the v3 escrow with its escrow deal id', async () => {
  const s = setup();
  await s.ops.release(V3_DEAL, 0, 'buyer-w');
  await s.ops.claim(V3_DEAL, 1, 'seller-w');
  assert.deepEqual(s.v3Calls.map((c) => c.name), ['release', 'claim']);
  assert.deepEqual(s.v2Calls, []);
});

test('a v3 release for a milestone that is not next is refused before any call', async () => {
  const s = setup(view({ paid: 1 }));
  await assert.rejects(s.ops.release(V3_DEAL, 0, 'buyer-w'), /not next/);
  assert.deepEqual(s.v3Calls, []);
});

test('arrival starts the v3 review once, and is a no-op on v2', async () => {
  const s = setup(view({ deliveredAt: 5n }));
  assert.ok(await s.ops.confirmArrival(V3_DEAL, 'buyer-w'));
  assert.equal(await s.ops.confirmArrival(V3_DEAL, 'buyer-w'), null, 'already started');
  assert.equal(await s.ops.confirmArrival({ jobId: 'v2' }, 'buyer-w'), null);
});

test('a v3 attestation names the current delivery revision and uses the guardian wallet', async () => {
  const s = setup(view({ revision: 4, deliveredAt: 5n }));
  await s.ops.attestDelivery(V3_DEAL, 0, true, `0x${'ee'.repeat(32)}`);
  assert.deepEqual(s.v3Calls, [{ name: 'attestCheck', walletId: 'guardian-w' }]);
});

test('the on-chain clock is always on for v3, and follows the v2b flag for v2', () => {
  const s = setup();
  assert.equal(s.ops.usesOnChainClock(V3_DEAL), true);
  assert.equal(s.ops.usesOnChainClock({ jobId: 'x' }), false);
});

test('a v3 deal with no escrow id on record fails loudly instead of touching v2', async () => {
  const s = setup();
  await assert.rejects(s.ops.release({ jobId: 'broken', escrowVersion: 'v3' }, 0, 'b'), /no escrow deal id/);
  assert.deepEqual(s.v2Calls, []);
});

test('suite_deal_reads_through_the_suite', async () => {
  const s = setup(view({ paid: 1, deliveredAt: 9n }));
  const a = await s.ops.read(SUITE_DEAL);
  assert.equal(a.version, 'suite');
  assert.equal(a.dealAmount, 1_000_000_000n);
  assert.deepEqual(a.milestonePcts, [50, 50]);
  assert.equal(a.milestonesReleased, 1);
  assert.equal(a.claimDeadline, 888n);
  assert.equal(a.reservationBps, 0);
  assert.equal(s.ops.refundableMicros(a), 992_500_000n + 15_000_000n);
});

test('suite_accept_release_claim_dispute_route_to_the_suite', async () => {
  // A suite dispute is about a delivery, so this one has one.
  const s = setup(view({ state: DEAL_STATE.Funded, deliveredAt: 5n }));
  await s.ops.accept(SUITE_DEAL, 'seller-agent');
  await s.ops.release(SUITE_DEAL, 0, 'buyer-agent');
  await s.ops.claim(SUITE_DEAL, 1, 'seller-agent');
  await s.ops.dispute(SUITE_DEAL, 'buyer-agent', 'not delivered');
  assert.deepEqual(s.suiteCalls.map((c) => [c.name, c.walletId]), [
    ['accept', 'seller-agent'], ['release', 'buyer-agent'], ['claim', 'seller-agent'], ['dispute', 'buyer-agent'],
  ]);
  assert.deepEqual(s.suiteCalls[0]!.params, [SUITE_ID, agreementTermsHash(TERMS_A)]);
  assert.deepEqual(s.v2Calls, []);
  assert.deepEqual(s.v3Calls, []);
});

test('accept_uses_the_terms_hash_read_from_the_escrow', async () => {
  const s = setup(view({ state: DEAL_STATE.Funded }));
  // A record whose stored hash drifted from the chain still accepts what the escrow holds.
  await s.ops.accept({ ...SUITE_DEAL, escrowTermsHash: `0x${'99'.repeat(32)}` }, 'seller-agent');
  assert.deepEqual(s.suiteCalls[0]!.params, [SUITE_ID, agreementTermsHash(TERMS_A)]);
});

test('a_suite_accept_needs_the_sellers_record_first', async () => {
  const s = setup(view({ state: DEAL_STATE.Funded }), { sellerRecord: false });
  await assert.rejects(s.ops.accept({ ...SUITE_DEAL, seller: `0x${'b1'.repeat(20)}` }, 'seller-agent'), IdentityNeeded);
  assert.deepEqual(s.suiteCalls, []);
});

test('a_suite_dispute_before_delivery_is_refused_without_a_call', async () => {
  const s = setup(view({ state: DEAL_STATE.Accepted, deliveredAt: 0n }));
  await assert.rejects(s.ops.dispute(SUITE_DEAL, 'buyer-agent', 'not delivered'), NothingDelivered);
  assert.deepEqual(s.suiteCalls, []);
});

test('suite_settle_by_split_proposes_then_accepts', async () => {
  const s = setup();
  await s.ops.settleBySplit(SUITE_DEAL, 'buyer-agent', 'seller-agent', 4000);
  assert.deepEqual(s.suiteCalls.map((c) => [c.name, c.walletId]), [['proposeSplit', 'buyer-agent'], ['acceptSplit', 'seller-agent']]);
});

test('suite_hold_returns_null_and_warns', async () => {
  const s = setup();
  assert.equal(await s.ops.hold(SUITE_DEAL, `0x${'ee'.repeat(32)}`), null);
  assert.equal(await s.ops.releaseHold(SUITE_DEAL), null);
  assert.equal(s.warnings.length, 2);
  assert.deepEqual(s.suiteCalls, []);
});

test('suite_attestation_goes_to_the_check_submitter_with_the_revision', async () => {
  const s = setup(view({ revision: 3, deliveredAt: 5n }));
  assert.equal(await s.ops.attestDelivery(SUITE_DEAL, 0, true, `0x${'ee'.repeat(32)}`), '0xcheck');
  assert.deepEqual(s.checks, [{ revision: 3, pass: true }]);
});

test('suite_lapse_dispute_is_refused', async () => {
  const s = setup();
  await assert.rejects(s.ops.lapseDispute(SUITE_DEAL, 'w'), /ruling/);
});

test('a_suite_deal_is_an_own_id_escrow_with_the_chain_clock', () => {
  const s = setup();
  assert.equal(s.ops.isV3(SUITE_DEAL), true);
  assert.equal(s.ops.isSuite(SUITE_DEAL), true);
  assert.equal(s.ops.isSuite(V3_DEAL), false);
  assert.equal(s.ops.usesOnChainClock(SUITE_DEAL), true);
});

test('financing_on_the_v2_contracts_is_refused_for_v3_and_suite_deals', async () => {
  const { onOwnIdEscrow } = await import('./dealEscrowOps.js');
  assert.equal(onOwnIdEscrow({ escrowVersion: 'suite' }), true);
  assert.equal(onOwnIdEscrow({ escrowVersion: 'v3' }), true);
  assert.equal(onOwnIdEscrow({ escrowVersion: 'v2' }), false);
  assert.equal(onOwnIdEscrow({}), false);
});
