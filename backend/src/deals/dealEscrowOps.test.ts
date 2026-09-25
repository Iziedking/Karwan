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
const { accountFromV3, createDealEscrowOps } = await import('./dealEscrowOps.js');
const { storeTerms } = await import('./fundDirectV3.js');

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

function setup(initial: View = view()) {
  let current = initial;
  const v2Calls: string[] = [];
  const v3Calls: Array<{ name: string; walletId: string }> = [];
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
  const ops = createDealEscrowOps({
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
    warn: () => undefined,
  });
  return { ops, v2Calls, v3Calls, get current() { return current; } };
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
