import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryAcceptanceLedger,
  clampStructuredOffer,
  decideReengagement,
  parseStructuredOffer,
  structuredOfferFingerprint,
  validateExactAcceptance,
} from './structuredOffer.js';

const baseOffer = {
  dealRoomId: 'room-1',
  offerId: 'offer-8',
  offerVersion: 8,
  senderRole: 'buyer' as const,
  recipientRole: 'seller' as const,
  kind: 'COUNTER' as const,
  action: 'REVISE_PRICE' as const,
  priceUsdc: '125.000000',
  deadlineUnix: 2_000,
  buyerMandateVersion: 3,
  sellerMandateVersion: 4,
  previousOfferId: 'offer-7',
  previousOfferVersion: 7,
  terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
};

test('strict structured offers reject invented fields and same-role messages', () => {
  assert.throws(() => parseStructuredOffer({ ...baseOffer, unexpected: true }), /Unrecognized key/);
  assert.throws(() => parseStructuredOffer({ ...baseOffer, recipientRole: 'buyer' }), /roles must differ/);
});

test('mandate clamps keep price and deadline within both hard boundaries', () => {
  const clamped = clampStructuredOffer({ ...baseOffer, priceUsdc: '200', deadlineUnix: 5_000 }, {
    buyerMaxPriceUsdc: '150',
    sellerMinPriceUsdc: '100',
    earliestDeadlineUnix: 1_000,
    latestDeadlineUnix: 3_000,
    buyerMandateVersion: 3,
    sellerMandateVersion: 4,
  });
  assert.equal(clamped.offer.priceUsdc, '150');
  assert.equal(clamped.offer.deadlineUnix, 3_000);
  assert.deepEqual(clamped.changedFields, ['priceUsdc', 'deadlineUnix']);
  assert.throws(() => clampStructuredOffer(baseOffer, {
    buyerMaxPriceUsdc: '99', sellerMinPriceUsdc: '100', buyerMandateVersion: 3, sellerMandateVersion: 4,
  }), /BOUNDARIES_CONFLICT/);
});

test('offer fingerprint ignores identity pointers but changes on terms', () => {
  const first = structuredOfferFingerprint(parseStructuredOffer(baseOffer));
  const second = structuredOfferFingerprint(parseStructuredOffer({ ...baseOffer, offerId: 'offer-9', offerVersion: 9, previousOfferId: 'offer-8', previousOfferVersion: 8 }));
  const third = structuredOfferFingerprint(parseStructuredOffer({ ...baseOffer, priceUsdc: '126' }));
  assert.equal(first, second);
  assert.notEqual(first, third);
});

test('acceptance requires exact deal room and offer versions', () => {
  const current = {
    dealRoomId: 'room-1', dealRoomVersion: 9, activeOfferId: 'offer-9', activeOfferVersion: 9,
    buyerMandateVersion: 3, sellerMandateVersion: 4,
  };
  const stale = validateExactAcceptance({ commandId: 'cmd-1', dealRoomId: 'room-1', expectedDealRoomVersion: 9, offerId: 'offer-8', offerVersion: 8, buyerMandateVersion: 3, sellerMandateVersion: 4 }, current);
  assert.equal(stale.outcome, 'stale');
  if (stale.outcome === 'stale') assert.equal(stale.reason, 'STALE_OFFER');
  const ledger = new InMemoryAcceptanceLedger();
  const command = { commandId: 'cmd-2', dealRoomId: 'room-1', expectedDealRoomVersion: 9, offerId: 'offer-9', offerVersion: 9, buyerMandateVersion: 3, sellerMandateVersion: 4 };
  assert.deepEqual(ledger.execute(command, current), ledger.execute(command, { ...current, dealRoomVersion: 10, activeOfferId: 'offer-10', activeOfferVersion: 10 }));
});

test('re-engagement schedules material triggers once and suppresses identical state', () => {
  const base = { trigger: 'TERMS_CHANGED' as const, triggerReference: 'event-1', nowUnix: 100, attemptCount: 1, maxAttempts: 3, currentFingerprint: 'new', previousFingerprint: 'old' };
  assert.deepEqual(decideReengagement(base), { outcome: 'schedule', key: 'TERMS_CHANGED:event-1' });
  assert.deepEqual(decideReengagement({ ...base, currentFingerprint: 'old' }), { outcome: 'suppress', reason: 'NO_MATERIAL_CHANGE' });
  assert.deepEqual(decideReengagement({ ...base, cooldownUntilUnix: 200 }), { outcome: 'suppress', reason: 'COOLDOWN' });
  assert.deepEqual(decideReengagement({ ...base, explicitDoNotReengage: true }), { outcome: 'suppress', reason: 'DO_NOT_REENGAGE' });
});

test('re-engagement spend cap uses exact micro-USDC arithmetic and allows the boundary', () => {
  const base = {
    trigger: 'TERMS_CHANGED' as const,
    triggerReference: 'event-spend-1',
    nowUnix: 100,
    attemptCount: 1,
    maxAttempts: 3,
    currentFingerprint: 'new',
    previousFingerprint: 'old',
    negotiationSpendUsdc: '0.999999',
    negotiationSpendCapUsdc: '1',
  };
  assert.deepEqual(decideReengagement({ ...base, nextAttemptCostUsdc: '0.000001' }), {
    outcome: 'schedule',
    key: 'TERMS_CHANGED:event-spend-1',
  });
  assert.deepEqual(decideReengagement({ ...base, nextAttemptCostUsdc: '0.000002' }), {
    outcome: 'suppress',
    reason: 'SPEND_CAP',
  });
  assert.throws(() => decideReengagement({ ...base, negotiationSpendUsdc: '1.0000001' }), /invalid USDC amount/);
});
