import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { worldCheckOverview } from './worldCheckOverview';

const deal = {
  verificationPolicy: 'high_signal',
  verificationSubject: 'seller',
  highSignalVerification: {
    mode: 'high_signal',
    subject: 'seller',
    provider: 'world-id',
    seller: { status: 'pending' },
  },
} as DirectDeal;

test('keeps a seller-only check read-only for the buyer', () => {
  assert.deepEqual(worldCheckOverview(deal, 'buyer'), {
    visible: true,
    actionable: false,
    state: 'waiting',
  });
});

test('makes a pending check actionable only for a required viewer', () => {
  assert.equal(worldCheckOverview(deal, 'seller').actionable, true);
  assert.equal(worldCheckOverview({ ...deal, verificationSubject: 'buyer' }, 'buyer').actionable, true);
  assert.equal(worldCheckOverview({ ...deal, verificationSubject: 'both' }, 'buyer').actionable, true);
});

test('stops prompting a verified viewer while the counterparty is pending', () => {
  const result = worldCheckOverview({
    ...deal,
    verificationSubject: 'both',
    highSignalVerification: {
      ...deal.highSignalVerification!,
      subject: 'both',
      buyer: { status: 'verified' },
      seller: { status: 'pending' },
    },
  }, 'buyer');
  assert.deepEqual(result, { visible: true, actionable: false, state: 'waiting' });
});

test('does not present unavailable or completed checks as actions', () => {
  assert.equal(worldCheckOverview({
    ...deal,
    highSignalVerification: {
      ...deal.highSignalVerification!,
      seller: { status: 'unavailable' },
    },
  }, 'seller').actionable, false);
  assert.deepEqual(worldCheckOverview({
    ...deal,
    highSignalVerification: {
      ...deal.highSignalVerification!,
      seller: { status: 'verified' },
    },
  }, 'seller'), { visible: true, actionable: false, state: 'verified' });
});
