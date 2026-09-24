import assert from 'node:assert/strict';
import test from 'node:test';
import { agreementDigest } from './agreementDigest.js';
import { termsDigest } from './termsDigest.js';
import { fundingAgreementBlock, type FundingAgreementDeal } from './fundingAgreement.js';

const terms = {
  buyer: '0x0000000000000000000000000000000000000001',
  seller: '0x0000000000000000000000000000000000000002',
  dealAmountUsdc: '500.00',
  firstReleasePct: 30,
  terms: 'Deliver the agreed build',
};

function approvedDeal(overrides: Partial<FundingAgreementDeal> = {}): FundingAgreementDeal {
  const deal: FundingAgreementDeal = { ...terms, agreementVersion: 2, ...overrides };
  return {
    ...deal,
    sellerApprovedAt: 1,
    sellerApprovedAgreementVersion: deal.agreementVersion,
    sellerApprovedAgreementDigest: agreementDigest(deal),
  };
}

test('both sides consented to the latest terms: funding may proceed', () => {
  const deal = approvedDeal();
  assert.equal(fundingAgreementBlock(deal, { version: 2, digest: agreementDigest(deal) }), null);
});

test('a counter that keeps the amount but moves the split cannot be funded on the old review', () => {
  const reviewed = approvedDeal();
  const reviewedDigest = agreementDigest(reviewed);
  // The seller counters at the same amount with a larger first release and re-approves.
  const countered = approvedDeal({ firstReleasePct: 80, agreementVersion: 3 });
  const block = fundingAgreementBlock(countered, { version: 2, digest: reviewedDigest });
  assert.equal(block?.code, 'AGREEMENT_CHANGED');
  assert.equal(block && 'agreementVersion' in block ? block.agreementVersion : null, 3);
});

test('a seller approval for an older version does not authorise the current terms', () => {
  const stale = { ...approvedDeal(), firstReleasePct: 60 };
  assert.deepEqual(fundingAgreementBlock(stale, { version: 2, digest: agreementDigest(stale) }), { code: 'STALE_AGREEMENT' });
});

test('no seller approval, no funding', () => {
  const deal = { ...approvedDeal(), sellerApprovedAt: undefined };
  assert.deepEqual(fundingAgreementBlock(deal, { version: 2, digest: agreementDigest(deal) }), { code: 'STALE_AGREEMENT' });
});

test('approvals from before agreement versions still count when the terms text is unchanged', () => {
  const legacy: FundingAgreementDeal = { ...terms, sellerApprovedAt: 1, sellerApprovedTermsDigest: termsDigest(terms.terms) };
  assert.equal(fundingAgreementBlock(legacy, { version: 1, digest: agreementDigest(legacy) }), null);
  const edited = { ...legacy, terms: 'Deliver something else' };
  assert.deepEqual(fundingAgreementBlock(edited, { version: 1, digest: agreementDigest(edited) }), { code: 'STALE_AGREEMENT' });
});
