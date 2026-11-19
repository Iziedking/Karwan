import assert from 'node:assert/strict';
import test from 'node:test';
import { DEAL_STATE } from '../chain/dealEscrowV3.js';
import { caseStep, findingHash, type CaseInput, type FindingRecord } from './disputeCase.js';

const DAY = 86_400;
const NOW = 1_800_000_000;
const WINDOW = 3 * DAY;
const DEADLINE = 4 * DAY + 12 * 3600;

function input(over: Partial<CaseInput> = {}, viewOver: Partial<CaseInput['view']> = {}): CaseInput {
  return {
    view: { state: DEAL_STATE.Disputed, escalated: false, proposal: false, proposedAt: 0n, disputedAt: BigInt(NOW - 3600), ...viewOver },
    escalatedAt: 0n,
    nowSecs: NOW,
    statements: { buyer: true, seller: false },
    finding: null,
    partialBps: 0,
    linkHeld: false,
    windowSecs: WINDOW,
    deadlineSecs: DEADLINE,
    ...over,
  };
}

const hoursIn = (h: number) => ({ disputedAt: BigInt(NOW - h * 3600) });

test('a deal no longer in dispute has no step', () => {
  assert.equal(caseStep(input({}, { state: DEAL_STATE.Accepted })), 'none');
  assert.equal(caseStep(input({}, { state: DEAL_STATE.Settled })), 'none');
});

test('one hour in with one answer missing, nothing moves: both sides are still being heard', () => {
  assert.equal(caseStep(input()), 'hearing');
});

test('the hearing ends when both have answered, even on the first hour', () => {
  assert.equal(caseStep(input({ statements: { buyer: true, seller: true } })), 'finding');
});

test('the hearing ends when the window closes, answered or not', () => {
  assert.equal(caseStep(input({ statements: { buyer: false, seller: false } }, hoursIn(72))), 'hearing');
  assert.equal(caseStep(input({ statements: { buyer: false, seller: false } }, { disputedAt: BigInt(NOW - WINDOW - 1) })), 'finding');
});

test('a held link goes to people at once, even during the hearing', () => {
  assert.equal(caseStep(input({ linkHeld: true })), 'refer');
});

test('a finding waits for a reviewer', () => {
  const finding = { status: 'awaiting-review' as const, sellerBps: 10_000 };
  assert.equal(caseStep(input({ statements: { buyer: true, seller: true }, finding })), 'review');
});

test('a confirmed all or nothing share is proposed on chain', () => {
  for (const sellerBps of [0, 10_000]) {
    const finding = { status: 'confirmed' as const, sellerBps };
    assert.equal(caseStep(input({ statements: { buyer: true, seller: true }, finding })), 'propose');
  }
  const changed = { status: 'overridden' as const, sellerBps: 0 };
  assert.equal(caseStep(input({ statements: { buyer: true, seller: true }, finding: changed })), 'propose');
});

test('a confirmed part share goes to people, unless the terms name exactly that share', () => {
  const finding = { status: 'confirmed' as const, sellerBps: 6_000 };
  assert.equal(caseStep(input({ statements: { buyer: true, seller: true }, finding })), 'refer');
  assert.equal(caseStep(input({ statements: { buyer: true, seller: true }, finding, partialBps: 6_000 })), 'propose');
});

test('a confirmed finding with no share goes to people', () => {
  const finding = { status: 'confirmed' as const, sellerBps: null };
  assert.equal(caseStep(input({ statements: { buyer: true, seller: true }, finding })), 'refer');
});

test('at the deadline, a case not yet confirmed goes to people with whatever is on file', () => {
  const late = { disputedAt: BigInt(NOW - DEADLINE) };
  assert.equal(caseStep(input({ statements: { buyer: true, seller: true } }, late)), 'refer');
  assert.equal(caseStep(input({ statements: { buyer: true, seller: true }, finding: { status: 'awaiting-review', sellerBps: 0 } }, late)), 'refer');
  assert.equal(caseStep(input({ statements: { buyer: false, seller: false } }, late)), 'refer');
});

test('what the chain shows wins over what the row says', () => {
  const finding = { status: 'confirmed' as const, sellerBps: 10_000 };
  const proposed = { proposal: true, proposedAt: BigInt(NOW - 3600) };
  assert.equal(caseStep(input({ finding }, proposed)), 'appeal-open');
  assert.equal(caseStep(input({ finding }, { proposal: true, proposedAt: BigInt(NOW - 72 * 3600) })), 'execute');
  assert.equal(caseStep(input({ finding, escalatedAt: BigInt(NOW - DAY) }, { escalated: true })), 'with-review');
  assert.equal(caseStep(input({ finding, escalatedAt: BigInt(NOW - 5 * DAY) }, { escalated: true })), 'fallback');
});

const record: FindingRecord = {
  dealKey: '0xdeal',
  inputsHash: '0xinputs',
  sellerBps: 6_000,
  items: [{ item: 'Logo files', finding: 'partly-delivered', evidence: 'Two of three files' }],
  reviewer: '0xreviewer',
  reason: 'Two of the three agreed files arrived.',
  confirmedAt: 1_800_000_000_000,
};

test('the finding hash is stable and covers every field', () => {
  assert.match(findingHash(record), /^0x[0-9a-f]{64}$/);
  const reordered = Object.fromEntries(Object.entries(record).reverse()) as unknown as FindingRecord;
  assert.equal(findingHash(reordered), findingHash(record));
  const changes: Array<Partial<FindingRecord>> = [
    { dealKey: '0xother' },
    { inputsHash: '0xother' },
    { sellerBps: 6_001 },
    { items: [] },
    { reviewer: '0xother' },
    { reason: 'Something else.' },
    { confirmedAt: 1 },
  ];
  for (const change of changes) assert.notEqual(findingHash({ ...record, ...change }), findingHash(record), Object.keys(change)[0]);
});
