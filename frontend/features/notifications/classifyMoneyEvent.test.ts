import assert from 'node:assert/strict';
import test from 'node:test';
import { NOTIFY_TYPES } from './notificationTypes';
import { bridgeDirection, classifyMoneyEvent, soundKeysFor, type MoneyViewer } from './classifyMoneyEvent';

const ME = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

type Case = {
  type: string;
  role?: MoneyViewer['role'];
  payload?: Record<string, unknown>;
  expect: 'in' | 'out' | null;
};

/// Every notification type and the sound it makes. A type added to
/// NOTIFY_TYPES without a row here fails the last test until someone decides.
const CASES: Case[] = [
  { type: 'wallet.credited', expect: 'in' },
  { type: 'wallet.debited', expect: 'out' },
  { type: 'agent.funded', expect: 'out' },
  { type: 'agent.funded', payload: { seed: true }, expect: 'in' },
  { type: 'agent.funded', payload: { agent: 'research', scope: 'agent-research-activation' }, expect: 'out' },
  { type: 'agent.withdrawal', payload: { toAddress: ME.toUpperCase() }, expect: 'in' },
  { type: 'agent.withdrawal', payload: { toAddress: OTHER }, expect: 'out' },
  { type: 'gateway.deposited', expect: null },
  { type: 'gateway.agent.funded', expect: 'out' },
  { type: 'gateway.cashed.out', expect: 'out' },
  { type: 'cashout.arc.completed', role: 'seller', expect: 'out' },
  { type: 'bridge.minted', expect: 'in' },
  { type: 'bridge.minted', payload: { direction: 'out' }, expect: null },
  { type: 'bridge.minted', payload: { destChainKey: 'baseSepolia' }, expect: null },
  { type: 'yield.credited', expect: 'in' },
  { type: 'yield.claimed', expect: 'in' },
  { type: 'vault.deposit', expect: 'out' },
  { type: 'vault.claimed', expect: 'in' },
  { type: 'vault.withdraw.requested', expect: null },
  { type: 'vault.withdraw.cancelled', expect: null },
  { type: 'vault.cooldown.completed', expect: null },
  { type: 'reputation.tier-up', expect: null },
  { type: 'escrow.milestone.released', role: 'seller', expect: 'in' },
  { type: 'escrow.milestone.released', role: 'buyer', expect: null },
  { type: 'escrow.settled', role: 'seller', expect: 'in' },
  { type: 'escrow.settled', role: 'buyer', expect: null },
  { type: 'deal.auto_released', role: 'seller', expect: 'in' },
  { type: 'escrow.resolved', role: 'seller', payload: { sellerBps: 6000 }, expect: 'in' },
  { type: 'escrow.resolved', role: 'buyer', payload: { sellerBps: 6000 }, expect: 'in' },
  { type: 'escrow.resolved', role: 'buyer', payload: { sellerBps: 10000 }, expect: null },
  { type: 'escrow.resolved', role: 'seller', payload: { sellerBps: 0 }, expect: null },
  { type: 'escrow.resolved', role: 'seller', expect: null },
  { type: 'deal.cancelled', role: 'buyer', payload: { kind: 'mutual' }, expect: 'in' },
  { type: 'deal.cancelled', role: 'buyer', payload: { kind: 'unilateral' }, expect: 'in' },
  { type: 'deal.cancelled', role: 'buyer', payload: { kind: 'pre-accept' }, expect: null },
  { type: 'deal.cancelled', role: 'seller', payload: { kind: 'mutual' }, expect: null },
  { type: 'factoring.accepted', role: 'financier', expect: 'out' },
  { type: 'factoring.settled', role: 'financier', expect: 'in' },
  { type: 'factoring.settled', role: 'seller', expect: null },
  { type: 'po.repaid', role: 'financier', expect: 'in' },
  { type: 'po.released', role: 'seller', expect: 'in' },
  { type: 'po.released', role: 'financier', expect: 'out' },
  ...[
    'deal.matched', 'deal.match.approved', 'deal.match.declined', 'deal.match.raised',
    'negotiation.near-miss', 'job.expired', 'listing.matched', 'agent.declined',
    'deal.direct.created', 'deal.invite.claimed', 'deal.seller-approved', 'deal.accepted',
    'deal.delivered', 'deal.delivery.flagged', 'deal.delivery.cleared', 'deal.fund.insufficient',
    'deal.review.started', 'deal.review.heartbeat', 'deal.deadline.passed', 'deal.disputed',
    'deal.cancel.proposed', 'deal.cancel.declined', 'factoring.requested', 'factoring.offered',
    'factoring.defaulted', 'po.funded', 'po.defaulted', 'trend.match',
  ].map((type): Case => ({ type, role: 'buyer', expect: null })),
];

for (const c of CASES) {
  const label = [c.type, c.role ? `as ${c.role}` : '', c.payload ? JSON.stringify(c.payload) : ''].filter(Boolean).join(' ');
  test(`${label} sounds ${c.expect ?? 'like a plain notice'}`, () => {
    assert.equal(classifyMoneyEvent(c.type, c.payload, { address: ME, role: c.role ?? null }), c.expect);
  });
}

test('every notification type has a decided sound', () => {
  const decided = new Set(CASES.map((c) => c.type));
  assert.deepEqual([...NOTIFY_TYPES].filter((type) => !decided.has(type)), []);
});

test('a transfer that does not say which way it went reads as arriving on Arc', () => {
  assert.equal(bridgeDirection({}), 'in');
  assert.equal(bridgeDirection({ destChainKey: 'arcTestnet' }), 'in');
  assert.equal(bridgeDirection({ destChainKey: 'solanaDevnet' }), 'out');
  assert.equal(bridgeDirection({ direction: 'out', destChainKey: 'arcTestnet' }), 'out');
});

test('sound keys carry the movement ids and the deal', () => {
  assert.deepEqual(
    soundKeysFor({ jobId: '0xjob', payload: { reference: 'KRW-1', txHash: '0xabc', bridgeId: 'b1' } }),
    { ids: ['KRW-1', '0xabc', null, 'b1'], deal: '0xjob' },
  );
  assert.deepEqual(soundKeysFor({ payload: {} }), { ids: [null, null, null, null], deal: null });
});
