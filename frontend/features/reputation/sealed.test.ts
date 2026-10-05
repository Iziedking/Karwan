import assert from 'node:assert/strict';
import test from 'node:test';
import { isSealedReputation, reasonLabels, reasonLine } from './sealed';
import { sealedRecordCopy } from '../../shared/i18n/messages/sealedRecord';

const copy = sealedRecordCopy.en;

test('a sealed response is recognised; a full one is not', () => {
  assert.equal(isSealedReputation({ sealed: true, address: '0x1', displayName: null, tag: null, tier: 'NEW', reasons: [], memberSince: null }), true);
  assert.equal(isSealedReputation({ address: '0x1', scoreBps: 0, successCount: 0, disputedCount: 0, failedCount: 0, totalDeals: 0 }), false);
});

test('reasons render as their labels, in order', () => {
  assert.deepEqual(reasonLabels(['NEW_ON_KARWAN', 'HUMAN_VERIFIED'], copy), ['New on Karwan', 'Verified as a unique person']);
  assert.equal(reasonLine(['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME'], copy), 'Has completed deals on Karwan · Usually delivers on time');
});

test('every locale labels every reason and band', () => {
  for (const locale of Object.values(sealedRecordCopy)) {
    for (const value of Object.values(locale.reasons)) assert.ok(value.trim().length > 0);
    for (const value of Object.values(locale.bands)) assert.ok(value.trim().length > 0);
  }
});
