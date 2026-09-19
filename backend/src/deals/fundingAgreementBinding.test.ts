import assert from 'node:assert/strict';
import test from 'node:test';
import { agreementDigest, type AgreementDigestInput } from './agreementDigest.js';
import { buildDirectDealFundingQuote } from './fundingQuote.js';

const JOB = `0x${'cd'.repeat(32)}`;

const reviewed: AgreementDigestInput = {
  buyer: `0x${'11'.repeat(20)}`,
  seller: `0x${'22'.repeat(20)}`,
  dealAmountUsdc: '100',
  firstReleasePct: 30,
  deadlineUnix: 1_800_000_000,
  terms: 'Deliver the release',
  evidenceRequired: true,
  verificationPolicy: 'high_signal',
  verificationSubject: 'seller',
  requireStake: true,
  requireStakePct: 50,
};

// A seller counter can move each of these without touching the amount, so the
// funding quote stays byte-identical and only the agreement digest notices.
const sameAmountCounters: Array<[string, Partial<AgreementDigestInput>]> = [
  ['payout split', { firstReleasePct: 99 }],
  ['delivery check', { evidenceRequired: false }],
  ['identity check', { verificationPolicy: 'standard', verificationSubject: undefined }],
  ['stake', { requireStake: false, requireStakePct: undefined }],
  ['deadline', { deadlineUnix: 1_900_000_000 }],
  ['terms text', { terms: 'Deliver something else' }],
];

for (const [label, change] of sameAmountCounters) {
  test(`a same-amount counter to the ${label} keeps the quote but changes the agreement the buyer must echo`, () => {
    const countered = { ...reviewed, ...change };
    const quoteBefore = buildDirectDealFundingQuote({ jobId: JOB, dealAmountUsdc: reviewed.dealAmountUsdc, feeBps: 100, quotedAt: 1 });
    const quoteAfter = buildDirectDealFundingQuote({ jobId: JOB, dealAmountUsdc: countered.dealAmountUsdc, feeBps: 100, quotedAt: 1 });
    assert.equal(quoteAfter.quoteFingerprint, quoteBefore.quoteFingerprint);
    assert.notEqual(agreementDigest(countered), agreementDigest(reviewed));
  });
}
