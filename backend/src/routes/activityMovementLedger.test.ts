import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoneyMovement } from '../money/model.js';
import {
  mergeMovementLedger,
  movementToPersonalLedgerItem,
  type PersonalLedgerItem,
} from './activityMovementLedger.js';

const buyer = `0x${'1'.repeat(40)}`;
const seller = `0x${'2'.repeat(40)}`;

function movement(state: 'created' | 'completed' | 'needs_attention' = 'created') {
  const base = createMoneyMovement(
    'KWN-2345-ABCD-EFGH',
    {
      operationKey: 'escrow_funding:job-1',
      kind: 'escrow_funding',
      amountMicros: '1250000',
      initiatedBy: buyer,
      participants: [
        { address: buyer, role: 'buyer' },
        { address: seller, role: 'seller' },
      ],
      summary: 'Escrow funding is being verified',
      nextActor: 'karwan',
      jobId: 'job-1',
    },
    1_000,
  );
  return {
    ...base,
    state,
    version: base.version + 1,
    updatedAt: state === 'created' ? 1_100 : 2_000,
    ...(state === 'completed' ? { completedAt: 2_000 } : {}),
    legs:
      state === 'completed'
        ? [
            {
              id: '1:fund',
              key: 'fund',
              attempt: 0,
              label: 'Fund escrow',
              rail: 'arc_contract' as const,
              state: 'verified' as const,
              idempotencyKey: 'fund-key',
              txHash: '0xreceipt',
              verifiedAt: 1_900,
              createdAt: 1_100,
            },
          ]
        : base.legs,
  };
}

function legacy(overrides: Partial<PersonalLedgerItem> = {}): PersonalLedgerItem {
  return {
    id: 'legacy-1',
    ts: 1_500,
    kind: 'release',
    summary: 'Legacy movement',
    params: null,
    amountUsdc: '2',
    txHash: null,
    refId: null,
    chain: 'arc',
    jobId: null,
    status: 'done',
    movementState: null,
    ...overrides,
  };
}

test('movement projection exposes reference, amount, chain, and verified receipt', () => {
  const item = movementToPersonalLedgerItem(movement('completed'));
  assert.equal(item.refId, 'KWN-2345-ABCD-EFGH');
  assert.equal(item.amountUsdc, '1.25');
  assert.equal(item.txHash, '0xreceipt');
  assert.equal(item.chain, 'arc');
  assert.equal(item.status, 'done');
  assert.equal(item.movementState, 'completed');
});

test('merge removes only the legacy projection for the same reference', () => {
  const durable = movement('completed');
  const rows = mergeMovementLedger(
    [
      legacy({ id: 'projection', refId: durable.reference, ts: 2_100 }),
      legacy({ id: 'unrelated', refId: null, ts: 2_200 }),
    ],
    [durable],
    100,
  );
  assert.deepEqual(rows.map((row) => row.id), ['unrelated', durable.reference]);
});

test('pending and attention movements remain visible with honest status', () => {
  assert.equal(movementToPersonalLedgerItem(movement('created')).status, 'pending');
  assert.equal(movementToPersonalLedgerItem(movement('needs_attention')).status, 'failed');
});

test('normalizes durable financing kinds for the viewer perspective', () => {
  const durable = createMoneyMovement(
    'KWN-2345-ABCD-EFGH',
    {
      operationKey: 'financing:advance:1',
      kind: 'financing_advance',
      amountMicros: '175000000',
      initiatedBy: seller,
      participants: [
        { address: seller, role: 'source' },
        { address: buyer, role: 'recipient' },
      ],
      summary: 'advance',
      nextActor: 'karwan',
      jobId: 'job-1',
    },
    1_000,
  );
  durable.legs = [{
    id: '1:advance',
    key: 'advance',
    attempt: durable.attempt,
    label: 'advance',
    rail: 'arc_contract',
    state: 'verified',
    idempotencyKey: 'advance-key',
    sourceAddress: seller,
    destinationAddress: buyer,
    createdAt: 1_000,
  }];
  assert.equal(movementToPersonalLedgerItem(durable, seller).kind, 'financing_funded');
  assert.equal(movementToPersonalLedgerItem(durable, buyer).kind, 'financing_received');
  const repayment = { ...durable, kind: 'financing_repayment' as const };
  assert.equal(movementToPersonalLedgerItem(repayment, buyer).kind, 'financing_repaid');
  assert.equal(movementToPersonalLedgerItem(repayment, seller).kind, 'financing_repayment_sent');
});

test('projects escrow payouts with the correct sign for each counterparty', () => {
  const durable = createMoneyMovement(
    'KWN-2345-ABCD-EFGH',
    {
      operationKey: 'payout:job-1:0',
      kind: 'milestone_payout',
      amountMicros: '50000000',
      initiatedBy: buyer,
      participants: [
        { address: buyer, role: 'buyer' },
        { address: seller, role: 'recipient' },
      ],
      summary: 'Milestone 1 paid',
      nextActor: 'karwan',
      jobId: 'job-1',
      milestoneIndex: 0,
    },
    1_000,
  );
  assert.equal(movementToPersonalLedgerItem(durable, buyer).kind, 'release');
  assert.equal(movementToPersonalLedgerItem(durable, seller).kind, 'payout');
});

test('merge respects the route limit after sorting newest first', () => {
  const rows = mergeMovementLedger(
    [legacy({ id: 'old', ts: 10 }), legacy({ id: 'new', ts: 30 })],
    [movement('completed')],
    2,
  );
  assert.deepEqual(rows.map((row) => row.id), ['KWN-2345-ABCD-EFGH', 'new']);
});

test('a send reads as sent for the sender and received for the recipient', () => {
  const base = createMoneyMovement(
    'KWN-3KPH-3EA6-DQWC',
    {
      operationKey: 'cashout:arc-send:x',
      kind: 'cash_out',
      amountMicros: '100000000',
      initiatedBy: buyer,
      participants: [
        { address: buyer, role: 'owner' },
        { address: seller, role: 'recipient' },
      ],
      summary: `Sent 100 USDC to ${seller}`,
      nextActor: 'karwan',
    },
    1_000,
  );
  const sent = {
    ...base,
    state: 'completed' as const,
    completedAt: 2_000,
    legs: [
      {
        id: '1:arc_transfer',
        key: 'arc_transfer',
        attempt: 0,
        label: 'Arc USDC cash-out',
        rail: 'circle_wallets' as const,
        state: 'verified' as const,
        idempotencyKey: 'send-key',
        sourceAddress: buyer,
        destinationAddress: seller,
        txHash: '0xsend',
        verifiedAt: 1_900,
        createdAt: 1_100,
      },
    ],
  };
  const names = new Map([[buyer, 'ada']]);

  const senderRow = movementToPersonalLedgerItem(sent, buyer, names);
  assert.equal(senderRow.kind, 'transfer_out');
  assert.deepEqual(senderRow.params, { t: 'sent', amount: '100', who: '0x2222…2222' });
  assert.equal(senderRow.txHash, '0xsend');

  const recipientRow = movementToPersonalLedgerItem(sent, seller, names);
  assert.equal(recipientRow.kind, 'transfer_in');
  assert.deepEqual(recipientRow.params, { t: 'received', amount: '100', who: '@ada' });
  assert.equal(recipientRow.refId, 'KWN-3KPH-3EA6-DQWC');
});

function bridgeMovement(opts: { initiatedBy: string; recipient: string; inbound: boolean }) {
  const base = createMoneyMovement(
    'KWN-7BRG-ABCD-EFGH',
    {
      operationKey: 'bridge:circle-bridge:x:1',
      kind: 'bridge',
      amountMicros: '2000000000',
      initiatedBy: opts.initiatedBy,
      participants: [
        { address: opts.initiatedBy, role: 'owner' },
        { address: opts.recipient, role: 'recipient' },
      ],
      summary: 'Sent 2000 USDC from Base to @someone',
      nextActor: 'karwan',
    },
    1_000,
  );
  const leg = (key: string, label: string) => ({
    id: `0:${key}`,
    key,
    attempt: 0,
    label,
    rail: 'cctp' as const,
    state: 'verified' as const,
    idempotencyKey: `${key}-key`,
    createdAt: 1_100,
  });
  return {
    ...base,
    legs: opts.inbound
      ? [leg('burn', 'Source-chain burn'), leg('mint', 'Arc destination mint')]
      : [leg('burn', 'Arc source burn'), leg('mint', 'Destination-chain mint')],
  };
}

test('a payment request paid from another network reads as received for the person paid', () => {
  const paid = bridgeMovement({ initiatedBy: buyer, recipient: seller, inbound: true });
  const names = new Map([[buyer, 'gulftextiles']]);
  const item = movementToPersonalLedgerItem(paid, seller, names);
  assert.equal(item.kind, 'transfer_in');
  assert.deepEqual(item.params, { t: 'received', amount: '2000', who: '@gulftextiles' });
});

test('the payer of that request sees it sent to the person, not sent to another network', () => {
  const paid = bridgeMovement({ initiatedBy: buyer, recipient: seller, inbound: true });
  const item = movementToPersonalLedgerItem(paid, buyer);
  assert.equal(item.kind, 'transfer_out');
  assert.equal(item.params?.t, 'sent');
});

test('money brought onto Arc into your own wallet or agent is a top up', () => {
  const own = bridgeMovement({ initiatedBy: buyer, recipient: buyer, inbound: true });
  assert.equal(movementToPersonalLedgerItem(own, buyer).kind, 'top_up');
  const agent = `0x${'3'.repeat(40)}`;
  const toAgent = bridgeMovement({ initiatedBy: buyer, recipient: agent, inbound: true });
  assert.equal(movementToPersonalLedgerItem(toAgent, buyer, undefined, { ownWallets: new Set([agent]) }).kind, 'top_up');
});

test('money moved off Arc is a cash out, and the bridge store names the chain', () => {
  const out = bridgeMovement({ initiatedBy: buyer, recipient: buyer, inbound: false });
  const item = movementToPersonalLedgerItem(out, buyer, undefined, {
    bridges: new Map([['KWN-7BRG-ABCD-EFGH', { direction: 'out' as const, chain: 'Base' }]]),
  });
  assert.equal(item.kind, 'cash_out');
  assert.deepEqual(item.params, { t: 'bridgeOut', amount: '2000', chain: 'Base' });
});

test('the bridge store direction wins over the leg labels', () => {
  const recorded = bridgeMovement({ initiatedBy: buyer, recipient: buyer, inbound: false });
  const item = movementToPersonalLedgerItem(recorded, buyer, undefined, {
    bridges: new Map([['KWN-7BRG-ABCD-EFGH', { direction: 'in' as const, chain: 'Base' }]]),
  });
  assert.equal(item.kind, 'top_up');
});

test('funding a deal reads as deal funded for the buyer, never as released', () => {
  assert.equal(movementToPersonalLedgerItem(movement('completed'), buyer).kind, 'escrow_funding');
});

test("the buyer's funding is not money out of the seller's account", () => {
  const rows = mergeMovementLedger([], [movement('completed')], 10, seller);
  assert.deepEqual(rows, []);
  const buyerRows = mergeMovementLedger([], [movement('completed')], 10, buyer);
  assert.equal(buyerRows.length, 1);
});

test("hiding the seller's copy of a funding still drops its legacy projection", () => {
  const rows = mergeMovementLedger(
    [legacy({ id: 'projection', refId: 'KWN-2345-ABCD-EFGH', kind: 'escrow_funding' })],
    [movement('completed')],
    10,
    seller,
  );
  assert.deepEqual(rows, []);
});

/// A financed deal: the seller took an 880 USDC advance, so the escrow pays the
/// financier first. Release 1 (992.50) went all to the financier; release 2
/// went 7.50 to the financier and 985 to the seller. The seller's statement
/// shows only what reached them, and the repayment as an unsigned note.
test('on a financed deal the seller sees what reached them, and the repayment as a note', () => {
  const escrow = `0x${'e'.repeat(40)}`;
  const financier = `0x${'f'.repeat(40)}`;
  const mv = (reference: string, kind: string, micros: string, tx: string, ts: number, extra: Record<string, unknown>) =>
    ({
      reference, kind, amountMicros: micros, state: 'completed', attempt: 1, version: 1, createdAt: ts, updatedAt: ts, completedAt: ts,
      summary: kind, jobId: 'job-9', initiatedBy: seller, participants: [], nextActor: 'none',
      legs: [{ key: 'transfer', label: kind, attempt: 1, txHash: tx, verifiedAt: ts, ...extra }],
      ...extra,
    }) as never;
  const movements = [
    mv('KWN-ADV', 'financing_advance', '880000000', '0xa1', 1, { sourceAddress: financier, destinationAddress: seller }),
    mv('KWN-PAY1', 'milestone_payout', '992500000', '0xr1', 2, { participants: [{ address: seller, role: 'recipient' }, { address: buyer, role: 'buyer' }] }),
    mv('KWN-REP1', 'financing_repayment', '992500000', '0xr1', 2, { sourceAddress: escrow, destinationAddress: financier }),
    mv('KWN-PAY2', 'milestone_payout', '992500000', '0xr2', 3, { participants: [{ address: seller, role: 'recipient' }, { address: buyer, role: 'buyer' }] }),
    mv('KWN-REP2', 'financing_repayment', '7500000', '0xr2', 3, { sourceAddress: escrow, destinationAddress: financier }),
  ];
  const rows = mergeMovementLedger([], movements, 50, seller);
  const view = rows.map((r) => [r.kind, r.amountUsdc]).sort();
  assert.deepEqual(view, [
    ['financing_paid_from_deal', '7.5'],
    ['financing_paid_from_deal', '992.5'],
    ['financing_received', '880'],
    ['payout', '985'],
  ]);

  // The financier's statement is unchanged: both parts of the repayment in.
  const theirs = mergeMovementLedger([], movements, 50, financier).filter((r) => r.kind.startsWith('financing'));
  assert.deepEqual(theirs.map((r) => [r.kind, r.amountUsdc]).sort(), [['financing_funded', '880'], ['financing_repaid', '7.5'], ['financing_repaid', '992.5']]);
});
