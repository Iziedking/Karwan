import { test } from 'node:test';
import assert from 'node:assert/strict';

/// The all-time totals: the arithmetic, not the chain read.
///
/// The scan itself is exercised by running `npm run scan:lifetime` against Arc.
/// What is worth testing here is the part where a wrong answer still looks
/// right: money folded into the wrong bucket, or base units escaping into a
/// field the UI renders as decimal USDC. Both produce a page full of confident
/// numbers that are simply false.
///
///   npx tsx --test src/chain/lifetimeStats.test.ts

const { fold, emptyContract, projectFromAcc } = await import('./lifetimeStats.js');
const { DEPLOY_LEDGER } = await import('./deployLedger.js');

const ESCROW = DEPLOY_LEDGER.find((c) => c.name === 'KarwanEscrow')!;
const VAULT = DEPLOY_LEDGER.find((c) => c.name === 'KarwanVault')!;
const PO_FINANCING = DEPLOY_LEDGER.find((c) => c.name === 'KarwanPOFinancing')!;
const INVOICE_REGISTRY = DEPLOY_LEDGER.find((c) => c.name === 'KarwanInvoiceRegistry')!;
const TREASURY = DEPLOY_LEDGER.find((c) => c.name === 'KarwanTreasury')!;
const YIELD_DISTRIBUTOR = DEPLOY_LEDGER.find((c) => c.name === 'KarwanYieldDistributor')!;

/// 1 USDC in base units. Escrow math is 6 decimals on Arc, not 18.
const ONE = 1_000_000n;

test('a funding event counts a deal and its full deal amount', () => {
  const row = emptyContract(ESCROW);
  fold(row, 'EscrowFunded', { dealAmount: 250n * ONE, fundedAmount: 260n * ONE });

  assert.equal(row.deals, 1);
  // dealAmount, not fundedAmount: fundedAmount includes the fee the buyer also
  // transfers, so summing it would report a volume larger than the trade.
  assert.equal(row.fundedUsdc, (250n * ONE).toString());
});

test('the first generation named the trade value `amount`, and it still counts', () => {
  // The oldest EscrowFunded was
  //   (jobId, buyer, seller, uint256 amount, uint8[] milestonePcts)
  // with no dealAmount at all. Reading only `dealAmount` decodes that log fine
  // and then adds zero, so the earliest history reads as a generation nobody
  // used rather than as money we failed to account for.
  const row = emptyContract(ESCROW);
  fold(row, 'EscrowFunded', { amount: 80n * ONE, milestonePcts: [100] });

  assert.equal(row.deals, 1);
  assert.equal(row.fundedUsdc, (80n * ONE).toString());
});

test('the first generation named the settled value `finalAmount`', () => {
  const row = emptyContract(ESCROW);
  fold(row, 'EscrowSettled', { finalAmount: 55n * ONE });
  assert.equal(row.settledUsdc, (55n * ONE).toString());
});

test('dealAmount wins over amount when a log carries both', () => {
  // No generation emits both, but the lookup is ordered and that order is the
  // thing under test: dealAmount is the trade value, and a future signature
  // carrying both must not fall back to whichever `amount` happens to mean.
  const row = emptyContract(ESCROW);
  fold(row, 'EscrowFunded', { dealAmount: 100n * ONE, amount: 999n * ONE });
  assert.equal(row.fundedUsdc, (100n * ONE).toString());
});

test('every historical signature is parseable and distinct by topic', async () => {
  // The generated file is the reason retired generations decode at all. If a
  // signature failed to parse the import would throw; if two collided on
  // topic0, decodeEventLog would pick arbitrarily between them.
  const { parseAbiItem, toEventSelector } = await import('viem');
  const { HISTORICAL_EVENT_SIGNATURES } = await import('./abis/historicalEvents.js');

  assert.ok(HISTORICAL_EVENT_SIGNATURES.length > 0, 'the historical ABI is empty');

  // Canonicalised by viem, not by a regex here: hand-rolling the
  // signature-to-selector transform is how you write a test that agrees with
  // itself and disagrees with the decoder.
  const byTopic = new Map<string, string>();
  for (const sig of HISTORICAL_EVENT_SIGNATURES) {
    const item = parseAbiItem(sig);
    assert.equal(item.type, 'event', `${sig} did not parse as an event`);
    const topic = toEventSelector(item as Parameters<typeof toEventSelector>[0]);
    const clash = byTopic.get(topic);
    assert.equal(clash, undefined, `${sig} and ${clash} share a topic`);
    byTopic.set(topic, sig);
  }

  // The three EscrowFunded shapes are the whole reason this file exists.
  const funded = HISTORICAL_EVENT_SIGNATURES.filter((s) => s.startsWith('event EscrowFunded('));
  assert.ok(funded.length >= 2, `expected multiple EscrowFunded shapes, got ${funded.length}`);
});

test('the two names for a milestone payout land in the same bucket', () => {
  // The v2 escrow renamed ProgressReleased to MilestoneClaimed. If they landed
  // in different buckets, the all-time released figure would silently split in
  // half at the generation boundary.
  const a = emptyContract(ESCROW);
  fold(a, 'ProgressReleased', { amount: 10n * ONE });
  const b = emptyContract(ESCROW);
  fold(b, 'MilestoneClaimed', { amount: 10n * ONE });

  assert.equal(a.releasedUsdc, b.releasedUsdc);
  assert.equal(a.releasedUsdc, (10n * ONE).toString());
});

test('a split resolution credits both sides, not one', () => {
  const row = emptyContract(ESCROW);
  fold(row, 'DisputeResolved', { sellerCut: 70n * ONE, buyerCut: 30n * ONE });

  assert.equal(row.settledUsdc, (70n * ONE).toString());
  assert.equal(row.refundedUsdc, (30n * ONE).toString());
});

test('the vault unlocking a seller stake is not a milestone payout', () => {
  // `Released` on the vault reads like `ProgressReleased` on the escrow and
  // means something else: a seller's own stake coming back to them, not deal
  // money moving. Folding it into releasedUsdc would inflate the figure with
  // money that never changed hands.
  const row = emptyContract(VAULT);
  fold(row, 'Released', { id: '0xabc', consumer: '0x1', owner: '0x2', amount: 500n * ONE });

  assert.equal(row.releasedUsdc, '0');
  assert.equal(row.settledUsdc, '0');
  assert.equal(row.fundedUsdc, '0');
});

test('an event that moves no money adds nothing', () => {
  const row = emptyContract(ESCROW);
  fold(row, 'ArbiterSet', { arbiter: '0x0000000000000000000000000000000000000001' });
  fold(row, 'OwnershipTransferred', { previousOwner: '0x1', newOwner: '0x2' });

  assert.equal(row.deals, 0);
  assert.equal(row.fundedUsdc, '0');
  assert.equal(row.settledUsdc, '0');
  // and it is NOT undecoded: it decoded fine, it just is not a payment.
  assert.equal(row.undecodedEvents, 0);
});

test('an unknown event name is ignored rather than guessed at', () => {
  const row = emptyContract(ESCROW);
  fold(row, 'SomeEventFromAFutureContract', { amount: 999n * ONE, dealAmount: 999n * ONE });

  assert.equal(row.fundedUsdc, '0');
  assert.equal(row.releasedUsdc, '0');
});

test('projection converts every amount to decimal USDC, rows included', () => {
  // The bug this guards: totals formatted, per-contract rows left in base
  // units. The page renders both, so the breakdown would read a million times
  // larger than the total it is meant to break down.
  const escrow = emptyContract(ESCROW);
  fold(escrow, 'EscrowFunded', { dealAmount: 1_500n * ONE });
  fold(escrow, 'FeeCollected', { amount: 15n * ONE });

  const stats = projectFromAcc(
    {
      cursor: '54000000',
      perContract: { [ESCROW.address]: escrow, [VAULT.address]: emptyContract(VAULT) },
      transactions: 7,
      scannedAt: 1,
    },
    54_000_000n,
  );

  assert.equal(stats.volumes.fundedUsdc, '1500');
  assert.equal(stats.volumes.feesUsdc, '15');

  const row = stats.contracts.find((c) => c.address === ESCROW.address)!;
  assert.equal(row.fundedUsdc, '1500', 'per-contract amount left in base units');
  assert.equal(row.feesUsdc, '15');
});

test('projection does not mutate the accumulator into decimals', () => {
  // projectFromAcc runs on every refresh. If it formatted the rows in place,
  // the next fold would add base units to a decimal string and every total
  // after the first refresh would be garbage.
  const escrow = emptyContract(ESCROW);
  fold(escrow, 'EscrowFunded', { dealAmount: 42n * ONE });
  const acc = {
    cursor: '54000000',
    perContract: { [ESCROW.address]: escrow },
    transactions: 1,
    scannedAt: 1,
  };

  projectFromAcc(acc, 54_000_000n);
  projectFromAcc(acc, 54_000_000n);

  assert.equal(acc.perContract[ESCROW.address]!.fundedUsdc, (42n * ONE).toString());
  assert.equal(projectFromAcc(acc, 54_000_000n).volumes.fundedUsdc, '42');
});

test('contracts that never emitted anything are reported, not dropped', () => {
  const used = emptyContract(ESCROW);
  used.events = 3;
  const stats = projectFromAcc(
    {
      cursor: '54000000',
      perContract: { [ESCROW.address]: used, [VAULT.address]: emptyContract(VAULT) },
      transactions: 3,
      scannedAt: 1,
    },
    54_000_000n,
  );

  // Both listed, only one counted as used. Dropping the unused one would make
  // the ledger look tidier and the coverage claim unverifiable.
  assert.equal(stats.contracts.length, 2);
  assert.equal(stats.totals.contracts, 2);
  assert.equal(stats.totals.contractsWithActivity, 1);
});

test('the scan range starts at the earliest deploy in the ledger', () => {
  const stats = projectFromAcc(
    { cursor: '54000000', perContract: {}, transactions: 0, scannedAt: 1 },
    54_000_000n,
  );
  const earliest = DEPLOY_LEDGER.reduce(
    (min, c) => (c.deployBlock < min ? c.deployBlock : min),
    DEPLOY_LEDGER[0]!.deployBlock,
  );
  assert.equal(stats.fromBlock, earliest.toString());
  assert.equal(stats.toBlock, '54000000');
});

test('the ledger holds every generation, not just the live one', () => {
  // The whole point of the page. A ledger that had collapsed to one escrow
  // would still produce a plausible-looking total.
  const escrows = DEPLOY_LEDGER.filter((c) => c.name === 'KarwanEscrow');
  assert.ok(escrows.length > 1, `expected retired escrows in the ledger, got ${escrows.length}`);

  const addresses = new Set(DEPLOY_LEDGER.map((c) => c.address));
  assert.equal(addresses.size, DEPLOY_LEDGER.length, 'the ledger has a duplicate address');

  for (const c of DEPLOY_LEDGER) {
    assert.match(c.address, /^0x[0-9a-f]{40}$/, `${c.address} is not a lowercase address`);
    assert.ok(c.deployBlock > 0n, `${c.address} has no deploy block`);
  }
});

// --- Trade finance -----------------------------------------------------------
//
// The rail the page was missing entirely. Two contracts, two event names, one
// meaning: a financier put capital in front of a supplier before the buyer
// settled. Getting the bucketing wrong here is invisible in the arithmetic and
// wrong in the story, because an advance folded into fundedUsdc reports the
// same trade twice.

test('a purchase-order advance counts as financing, not as new deal volume', () => {
  const po = emptyContract(PO_FINANCING);
  fold(po, 'POFunded', {
    principalUsdc: 900n * ONE,
    repayUsdc: 990n * ONE,
    repaymentTimeoutAt: 1n,
  });

  assert.equal(po.financings, 1);
  assert.equal(po.advancedUsdc, (900n * ONE).toString());
  // principalUsdc is what left the financier's wallet. repayUsdc is what the
  // supplier owes back and has not paid yet, so counting it here would report
  // money that has not moved.
  assert.equal(po.repaidUsdc, '0');
  // The deal already counted its value when the escrow was funded. Adding the
  // advance on top would report one trade as two.
  assert.equal(po.fundedUsdc, '0');
  assert.equal(po.deals, 0);
});

test('an invoice factored lands in the same bucket as a PO advance', () => {
  const registry = emptyContract(INVOICE_REGISTRY);
  fold(registry, 'ReceivableAssigned', { advanceUsdc: 400n * ONE, repayUsdc: 430n * ONE });

  assert.equal(registry.financings, 1);
  assert.equal(registry.advancedUsdc, (400n * ONE).toString());
});

test('repayment and default are tracked apart from the advance', () => {
  const po = emptyContract(PO_FINANCING);
  fold(po, 'POFunded', { principalUsdc: 500n * ONE, repayUsdc: 550n * ONE });
  fold(po, 'PORepaid', { repayUsdc: 550n * ONE });
  fold(po, 'PODefaulted', {});
  fold(po, 'CollateralSlashed', { amount: 100n * ONE });

  assert.equal(po.advancedUsdc, (500n * ONE).toString());
  assert.equal(po.repaidUsdc, (550n * ONE).toString());
  assert.equal(po.defaults, 1);
  // Forfeited collateral is the same movement as a lost dispute: stake the
  // seller posted went to the other side.
  assert.equal(po.slashedUsdc, (100n * ONE).toString());
});

// --- Colliding event names ---------------------------------------------------

test('the vault and the treasury both emit Deposited, and only one is staking', () => {
  // Different shapes, different topic0, so both decode. But fold() switches on
  // the NAME, so without the kind check the treasury moving its own fee balance
  // would be reported as a seller staking collateral.
  const vault = emptyContract(VAULT);
  fold(vault, 'Deposited', { positionId: 1n, owner: '0xabc', principal: 300n * ONE });
  assert.equal(vault.stakedUsdc, (300n * ONE).toString());

  const treasury = emptyContract(TREASURY);
  fold(treasury, 'Deposited', { from: '0xabc', amount: 300n * ONE });
  assert.equal(treasury.stakedUsdc, '0');
});

test('yield counts when it is claimed, not when it is credited', () => {
  const dist = emptyContract(YIELD_DISTRIBUTOR);
  fold(dist, 'YieldCredited', { staker: '0xabc', amount: 50n * ONE, day: 1 });
  assert.equal(dist.yieldUsdc, '0', 'a credit is an accrual, not a payment');

  fold(dist, 'YieldClaimed', { staker: '0xabc', to: '0xabc', amount: 20n * ONE });
  assert.equal(dist.yieldUsdc, (20n * ONE).toString());
});

// --- Rollups -----------------------------------------------------------------

test('the kind rollup splits settlement from financing and sums to the total', () => {
  const escrow = emptyContract(ESCROW);
  fold(escrow, 'EscrowFunded', { dealAmount: 1_000n * ONE });
  const po = emptyContract(PO_FINANCING);
  fold(po, 'POFunded', { principalUsdc: 700n * ONE });
  const registry = emptyContract(INVOICE_REGISTRY);
  fold(registry, 'ReceivableAssigned', { advanceUsdc: 300n * ONE });
  for (const r of [escrow, po, registry]) r.events = 1;

  const stats = projectFromAcc(
    {
      cursor: '54000000',
      perContract: {
        [ESCROW.address]: escrow,
        [PO_FINANCING.address]: po,
        [INVOICE_REGISTRY.address]: registry,
      },
      transactions: 3,
      scannedAt: 1,
    },
    54_000_000n,
  );

  const settlement = stats.byKind.find((k) => k.kind === 'settlement')!;
  const financing = stats.byKind.find((k) => k.kind === 'financing')!;

  assert.equal(settlement.volumes.fundedUsdc, '1000');
  assert.equal(settlement.volumes.advancedUsdc, '0');
  // Both financing contracts roll into one row, which is the point of grouping.
  assert.equal(financing.volumes.advancedUsdc, '1000');
  assert.equal(financing.contracts, 2);

  // The headline is still the sum of the parts.
  assert.equal(stats.volumes.fundedUsdc, '1000');
  assert.equal(stats.volumes.advancedUsdc, '1000');
  assert.equal(stats.totals.financings, 2);
});

test('every kind is present even when it moved nothing', () => {
  // A missing row and a zero row look the same on a page that renders only what
  // it is given, and they mean different things: "we do not run that" versus
  // "nobody has used it yet".
  const stats = projectFromAcc(
    { cursor: '54000000', perContract: {}, transactions: 0, scannedAt: 1 },
    54_000_000n,
  );
  const kinds = stats.byKind.map((k) => k.kind);
  for (const expected of ['settlement', 'financing', 'staking', 'treasury', 'registry']) {
    assert.ok(kinds.includes(expected as never), `${expected} missing from the rollup`);
  }
});

test('every money field is converted out of base units, none left behind', () => {
  // The failure this catches: a field added to the row and to the sum but
  // forgotten in the formatting step renders a million times too large, and
  // reads as a wildly successful platform.
  const row = emptyContract(PO_FINANCING);
  fold(row, 'POFunded', { principalUsdc: 3n * ONE });
  fold(row, 'PORepaid', { repayUsdc: 3n * ONE });
  fold(row, 'CollateralSlashed', { amount: 3n * ONE });
  const vault = emptyContract(VAULT);
  fold(vault, 'Deposited', { principal: 3n * ONE });
  const dist = emptyContract(YIELD_DISTRIBUTOR);
  fold(dist, 'YieldClaimed', { amount: 3n * ONE });
  const escrow = emptyContract(ESCROW);
  fold(escrow, 'EscrowFunded', { dealAmount: 3n * ONE });
  fold(escrow, 'ProgressReleased', { amount: 3n * ONE });
  fold(escrow, 'EscrowSettled', { sellerTotal: 3n * ONE });
  fold(escrow, 'EscrowRefunded', { amount: 3n * ONE });
  fold(escrow, 'FeeCollected', { amount: 3n * ONE });

  const stats = projectFromAcc(
    {
      cursor: '54000000',
      perContract: {
        [ESCROW.address]: escrow,
        [PO_FINANCING.address]: row,
        [VAULT.address]: vault,
        [YIELD_DISTRIBUTOR.address]: dist,
      },
      transactions: 1,
      scannedAt: 1,
    },
    54_000_000n,
  );

  for (const [key, value] of Object.entries(stats.volumes)) {
    assert.equal(value, '3', `${key} did not come out of base units`);
  }
});

test('total moved is every inflow, and counts no dollar twice', () => {
  // A buyer funds escrow, a financier advances against it, a seller stakes
  // behind it. Three different people putting money in, so three inflows.
  const escrow = emptyContract(ESCROW);
  fold(escrow, 'EscrowFunded', { dealAmount: 1_000n * ONE });
  fold(escrow, 'ProgressReleased', { amount: 600n * ONE });
  fold(escrow, 'EscrowSettled', { sellerTotal: 400n * ONE });
  const po = emptyContract(PO_FINANCING);
  fold(po, 'POFunded', { principalUsdc: 200n * ONE });
  const vault = emptyContract(VAULT);
  fold(vault, 'Deposited', { principal: 50n * ONE });

  const stats = projectFromAcc(
    {
      cursor: '54000000',
      perContract: {
        [ESCROW.address]: escrow,
        [PO_FINANCING.address]: po,
        [VAULT.address]: vault,
      },
      transactions: 3,
      scannedAt: 1,
    },
    54_000_000n,
  );

  // 1000 in + 200 advanced + 50 staked. The 600 released and 400 settled are
  // the same dollars leaving, and adding them would report 2,250 for a
  // platform that took 1,250.
  assert.equal(stats.totalMovedUsdc, '1250');
});
