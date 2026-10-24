import assert from 'node:assert/strict';
import test from 'node:test';
import { IdentityNeeded } from '../identity/suiteIdentity.js';
import { sellerRecordNeeded } from './sellerRecordGate.js';

const deal = { jobId: 'deal-1', seller: `0x${'b1'.repeat(20)}` };
const noRecord = async () => {
  throw new IdentityNeeded('record_setup_needed');
};

test('a_seller_without_a_record_sets_it_up_before_agreeing_to_a_deal_on_the_family', async () => {
  const r = await sellerRecordNeeded(deal, { fundsOnSuite: async () => true, requireIdentity: noRecord });
  assert.equal(r?.code, 'record_setup_needed');
  assert.match(r?.error ?? '', /Karwan record/);
});

test('no_record_is_asked_for_a_deal_that_stays_on_the_current_escrow', async () => {
  assert.equal(await sellerRecordNeeded(deal, { fundsOnSuite: async () => false, requireIdentity: noRecord }), null);
});

test('a_seller_with_a_record_agrees_straight_away', async () => {
  const asked: string[] = [];
  const r = await sellerRecordNeeded(deal, {
    fundsOnSuite: async () => true,
    requireIdentity: async (user, role) => {
      asked.push(`${user}:${role}`);
    },
  });
  assert.equal(r, null);
  assert.deepEqual(asked, [`${deal.seller}:seller`]);
});
