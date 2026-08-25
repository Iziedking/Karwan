import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLegacyRaisedOfferShadowInput } from './legacyOfferProjection.js';

const buyerAgent = '0x1111111111111111111111111111111111111111';
const sellerAgent = '0x2222222222222222222222222222222222222222';

const base = {
  dealRoomId: 'job-legacy-raise-1',
  buyerAgent,
  sellerAgent,
  buyerMaxPriceUsdc: '150.000000',
  sellerMinPriceUsdc: '100',
  raisedPriceUsdc: '125.500000',
  deadlineUnix: 2_000,
  buyerMandateVersion: 3,
  sellerMandateVersion: 4,
  offerVersion: 2,
  termsScope: 'research deliverable',
  observedAtUnix: 1_000,
} as const;

test('legacy raise projects a bounded seller counter with stable version identity', () => {
  const projected = buildLegacyRaisedOfferShadowInput(base);
  assert.ok(projected);
  assert.equal(projected.source, 'legacy-proposal');
  assert.equal(projected.commandId, 'legacy-negotiation:raise:job-legacy-raise-1:2');
  assert.equal(projected.idempotencyKey, projected.commandId);
  assert.equal(projected.expectedDealRoomVersion, 2);
  assert.deepEqual(projected.mandates, {
    buyerMaxPriceUsdc: '150',
    sellerMinPriceUsdc: '100',
    buyerMandateVersion: 3,
    sellerMandateVersion: 4,
  });
  assert.deepEqual(projected.rawOffer, {
    dealRoomId: 'job-legacy-raise-1',
    offerId: `legacy-offer:job-legacy-raise-1:${sellerAgent}:2`,
    offerVersion: 2,
    senderRole: 'seller',
    recipientRole: 'buyer',
    kind: 'COUNTER',
    action: 'REVISE_PRICE',
    priceUsdc: '125.5',
    deadlineUnix: 2_000,
    buyerMandateVersion: 3,
    sellerMandateVersion: 4,
    previousOfferId: `legacy-offer:job-legacy-raise-1:${sellerAgent}:1`,
    previousOfferVersion: 1,
    terms: {
      scope: 'research deliverable',
      delivery: 'by 2000',
      paymentTerms: 'after acceptance',
    },
  });
  assert.deepEqual(
    buildLegacyRaisedOfferShadowInput(base),
    projected,
    'the same legacy snapshot must produce the same shadow command',
  );
});

test('malformed or contradictory legacy raises are not projected', () => {
  assert.equal(buildLegacyRaisedOfferShadowInput({ ...base, buyerAgent: 'not-an-address' }), null);
  assert.equal(buildLegacyRaisedOfferShadowInput({ ...base, raisedPriceUsdc: 'not-usdc' }), null);
  assert.equal(buildLegacyRaisedOfferShadowInput({ ...base, sellerMinPriceUsdc: '151' }), null);
  assert.equal(buildLegacyRaisedOfferShadowInput({ ...base, offerVersion: 0 }), null);
});

