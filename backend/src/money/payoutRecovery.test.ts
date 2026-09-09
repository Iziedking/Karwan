import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePayoutRecoveryTarget } from './payoutRecovery.js';

const movement = {
  reference: 'KWN-AAAA-BBBB-CCCC',
  jobId: 'deal-1',
  kind: 'milestone_payout' as const,
  participants: [{ address: '0xbuyer', role: 'buyer' as const }],
  milestoneIndex: 0,
};

test('recovery binds the exact advanced payout and buyer', () => {
  assert.deepEqual(validatePayoutRecoveryTarget(movement, {
    reference: movement.reference,
    jobId: 'deal-1',
    buyer: '0xBuyer',
    milestonesReleased: 1,
  }), { ok: true });
});

test('recovery cannot target the next payout or another reference', () => {
  assert.deepEqual(validatePayoutRecoveryTarget(movement, {
    reference: movement.reference,
    jobId: 'deal-1',
    buyer: '0xbuyer',
    milestonesReleased: 0,
  }), { ok: false, code: 'NOT_ADVANCED' });
  assert.deepEqual(validatePayoutRecoveryTarget(movement, {
    reference: 'KWN-DDDD-EEEE-FFFF',
    jobId: 'deal-1',
    buyer: '0xbuyer',
    milestonesReleased: 1,
  }), { ok: false, code: 'WRONG_REFERENCE' });
});
