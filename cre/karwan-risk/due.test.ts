import { describe, expect, test } from 'bun:test';
import { keccak256, toBytes, type Address } from 'viem';
import { KEEP_SELECTORS } from '../shared/adapterReport.js';
import { agreementAlerts, agreementCandidates, type AgreementView, type DisputeView } from './due.js';

const FAMILY = '0x00000000000000000000000000000000000fa411' as Address;
const DEAL = keccak256(toBytes('deal'));
const NOW = 1_800_000_000;
const DAY = 86_400;

const deal = (over: Partial<AgreementView> = {}): AgreementView => ({
  state: 2,
  deliveredAt: NOW - 10 * DAY,
  deadline: NOW + 5 * DAY,
  reviewEnd: NOW - DAY,
  checkFailed: false,
  partsPaid: 0,
  ...over,
});
const noDispute: DisputeView = { openedAt: 0, proposed: false, escalated: false, proposedAt: 0, escalatedAt: 0 };
const selectors = (calls: { selector: string }[]) => calls.map((c) => c.selector);

describe('agreement candidates', () => {
  test('a delivered deal past its review window is a claim candidate', () => {
    expect(selectors(agreementCandidates(FAMILY, DEAL, deal(), noDispute, NOW))).toEqual([KEEP_SELECTORS['claim(bytes32)']]);
  });

  test('no claim while review runs, before delivery, or after a failed check', () => {
    expect(agreementCandidates(FAMILY, DEAL, deal({ reviewEnd: NOW + DAY }), noDispute, NOW)).toEqual([]);
    expect(agreementCandidates(FAMILY, DEAL, deal({ deliveredAt: 0, reviewEnd: 0 }), noDispute, NOW)).toEqual([]);
    expect(selectors(agreementCandidates(FAMILY, DEAL, deal({ checkFailed: true }), noDispute, NOW))).not.toContain(KEEP_SELECTORS['claim(bytes32)']);
  });

  test('past the deadline, a refund is a candidate', () => {
    expect(selectors(agreementCandidates(FAMILY, DEAL, deal({ deliveredAt: 0, reviewEnd: 0, deadline: NOW - 1 }), noDispute, NOW)))
      .toEqual([KEEP_SELECTORS['reclaim(bytes32)']]);
  });

  test('an unappealed proposal after 72 hours is executed; a missed ruling falls back after 5 days', () => {
    const disputed = deal({ state: 3 });
    const proposed = { ...noDispute, openedAt: NOW - 4 * DAY, proposed: true, proposedAt: NOW - 3 * DAY };
    expect(selectors(agreementCandidates(FAMILY, DEAL, disputed, proposed, NOW))).toEqual([KEEP_SELECTORS['executeRuling(bytes32)']]);
    expect(agreementCandidates(FAMILY, DEAL, disputed, { ...proposed, proposedAt: NOW - 3 * DAY + 1 }, NOW)).toEqual([]);
    const escalated = { ...noDispute, openedAt: NOW - 9 * DAY, escalated: true, escalatedAt: NOW - 5 * DAY };
    expect(selectors(agreementCandidates(FAMILY, DEAL, disputed, escalated, NOW))).toEqual([KEEP_SELECTORS['applyFallback(bytes32)']]);
  });

  test('every candidate carries the deal id as its argument', () => {
    const [call] = agreementCandidates(FAMILY, DEAL, deal(), noDispute, NOW);
    expect(call).toEqual({ family: FAMILY, selector: KEEP_SELECTORS['claim(bytes32)'], args: DEAL });
  });
});

describe('agreement alerts', () => {
  test('a deadline within a day and no delivery', () => {
    expect(agreementAlerts(FAMILY, DEAL, deal({ deliveredAt: 0, deadline: NOW + DAY }), noDispute, NOW))
      .toEqual([{ kind: 'deadline_near_no_delivery', family: FAMILY, dealId: DEAL }]);
    expect(agreementAlerts(FAMILY, DEAL, deal({ deliveredAt: 0, deadline: NOW + DAY + 1 }), noDispute, NOW)).toEqual([]);
  });

  test('a dispute with no proposal on its fourth day, and a ruling due on its fourth day', () => {
    const disputed = deal({ state: 3 });
    expect(agreementAlerts(FAMILY, DEAL, disputed, { ...noDispute, openedAt: NOW - 4 * DAY }, NOW))
      .toEqual([{ kind: 'dispute_no_proposal', family: FAMILY, dealId: DEAL }]);
    expect(agreementAlerts(FAMILY, DEAL, disputed, { ...noDispute, openedAt: NOW - 6 * DAY, escalated: true, escalatedAt: NOW - 4 * DAY }, NOW))
      .toEqual([{ kind: 'ruling_due', family: FAMILY, dealId: DEAL }]);
  });
});
