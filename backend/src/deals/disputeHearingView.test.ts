import assert from 'node:assert/strict';
import test from 'node:test';
import type { JudgeProposal } from './disputeJudge.js';
import { hearingForAssistant, hearingView, partyFinding, type ChainDispute, type HearingInput } from './disputeHearingView.js';

const H = 3_600_000;
const OPENED = 1_800_000_000;
const OPENED_MS = OPENED * 1000;
const WINDOW = 72 * H;
const DEADLINE = 108 * H;

const open: ChainDispute = { openedAt: BigInt(OPENED), proposed: false, escalated: false, proposedAt: 0n, escalatedAt: 0n };
const input = (over: Partial<HearingInput> = {}): HearingInput => ({
  dispute: open,
  nowMs: OPENED_MS + H,
  statements: { buyer: true, seller: false },
  finding: null,
  partialBps: 0,
  linkHeld: false,
  windowMs: WINDOW,
  deadlineMs: DEADLINE,
  ...over,
});

test('no dispute on the escrow shows nothing', () => {
  assert.equal(hearingView(input({ dispute: { ...open, openedAt: 0n } })), null);
});

test('while a side can still answer, both sides see when answers close and when the finding is due', () => {
  assert.deepEqual(hearingView(input()), {
    step: 'answers', answersBy: OPENED_MS + WINDOW, findingBy: OPENED_MS + DEADLINE, objectBy: null, askedAt: null, ruleBy: null,
  });
});

test('once both answered, or the window passed, Karwan writes the finding', () => {
  assert.equal(hearingView(input({ statements: { buyer: true, seller: true } }))?.step, 'finding');
  assert.equal(hearingView(input({ nowMs: OPENED_MS + WINDOW + H }))?.step, 'finding');
  const waiting = { status: 'awaiting-review' as const, reviewedSellerBps: undefined };
  assert.equal(hearingView(input({ statements: { buyer: true, seller: true }, finding: waiting }))?.step, 'finding');
  const confirmed = { status: 'confirmed' as const, reviewedSellerBps: 10_000 };
  assert.equal(hearingView(input({ statements: { buyer: true, seller: true }, finding: confirmed }))?.step, 'finding');
});

test('a finding proposed on chain gives 72 hours to object, then pays out', () => {
  const proposedAt = OPENED + 80 * 3600;
  const v = hearingView(input({ dispute: { ...open, proposed: true, proposedAt: BigInt(proposedAt) }, nowMs: proposedAt * 1000 + H }));
  assert.equal(v?.step, 'object');
  assert.equal(v?.objectBy, proposedAt * 1000 + 72 * H);
});

test('with people at Karwan, the page says when it was asked and the date they decide by', () => {
  const at = OPENED + 90 * 3600;
  const v = hearingView(input({ dispute: { ...open, proposed: true, proposedAt: BigInt(at - 3600), escalated: true, escalatedAt: BigInt(at) }, nowMs: at * 1000 + H }));
  assert.equal(v?.step, 'people');
  assert.equal(v?.askedAt, at * 1000);
  assert.equal(v?.ruleBy, at * 1000 + 5 * 24 * H);
});

test('a confirmed part share the escrow cannot propose goes to people', () => {
  const v = hearingView(input({ statements: { buyer: true, seller: true }, finding: { status: 'overridden', reviewedSellerBps: 6_000 } }));
  assert.equal(v?.step, 'people');
  assert.equal(v?.ruleBy, null);
});

const proposal: JudgeProposal = {
  sellerBps: 5_000,
  items: [{ item: 'Logo files', finding: 'delivered', evidence: 'the check' }],
  confidence: 'clear',
  summary: 'What the model wrote.',
  model: 'judge-model',
  inputsHash: '0xab',
  proposedAt: 1,
  status: 'awaiting-review',
};

test('the sides never see a finding before a person confirmed it', () => {
  assert.equal(partyFinding(proposal), undefined);
  assert.equal(partyFinding(undefined), undefined);
});

test('a confirmed finding shows the confirmed share and reason, never who confirmed it or the model', () => {
  const seen = partyFinding({ ...proposal, status: 'overridden', reviewedSellerBps: 10_000, reviewReason: 'The carrier marked it delivered.', reviewedBy: 'reviewer@karwan', reviewedAt: 9, findingHash: '0x01' });
  assert.deepEqual(seen, {
    sellerBps: 10_000, items: proposal.items, confidence: 'clear', summary: 'The carrier marked it delivered.',
    proposedAt: 1, status: 'overridden', reviewedSellerBps: 10_000, reviewedAt: 9,
  });
  assert.equal(JSON.stringify(seen).includes('reviewer@karwan'), false);
});

test('the assistant reads the same step and dates, from the side it speaks for', () => {
  const v = hearingView(input())!;
  assert.deepEqual(hearingForAssistant(v, undefined, 'seller', { mine: false, theirs: true }, OPENED_MS + H), {
    step: 'answers',
    yourSideSent: false,
    theirSideSent: true,
    answersBy: new Date(OPENED_MS + WINDOW).toISOString(),
    findingBy: new Date(OPENED_MS + DEADLINE).toISOString(),
    objectBy: null,
    askedAt: null,
    ruleBy: null,
    canAskForPeople: false,
    finding: null,
  });
});

test('in the time to object the assistant can say what was found, the share to the viewer and that a person may still decide', () => {
  const proposedAt = OPENED + 80 * 3600;
  const v = hearingView(input({ dispute: { ...open, proposed: true, proposedAt: BigInt(proposedAt) }, nowMs: proposedAt * 1000 }))!;
  const found = partyFinding({ ...proposal, status: 'overridden', reviewedSellerBps: 6_000, reviewReason: 'Two of five files arrived late.' });
  const a = hearingForAssistant(v, found, 'buyer', { mine: true, theirs: true }, proposedAt * 1000 + H);
  assert.equal(a.canAskForPeople, true);
  assert.deepEqual(a.finding, { toSellerPct: 60, toYouPct: 40, reason: 'Two of five files arrived late.' });
  assert.equal(hearingForAssistant(v, found, 'buyer', { mine: true, theirs: true }, proposedAt * 1000 + 73 * H).canAskForPeople, false);
});
