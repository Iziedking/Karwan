import assert from 'node:assert/strict';
import test from 'node:test';
import { dealIdInPath, dealReference } from './dealReference';

const A = '0xd68fe7d8eaf9cde16836c248d1df7d5811342d77ad987d0b83fb2ccf5e888172';

test('the page shows the same reference the assistant uses', () => {
  assert.equal(dealReference(A), 'D68F-E7D8');
  assert.equal(dealReference('0x12'), null);
});

test('the Help panel knows the deal only on a deal page', () => {
  assert.equal(dealIdInPath(`/deals/${A}`), A);
  assert.equal(dealIdInPath(`/deals/${A}/receipt`), A);
  assert.equal(dealIdInPath(`/fr/deals/${A}`), A);
  assert.equal(dealIdInPath('/deals'), null);
  assert.equal(dealIdInPath('/deals/0x12'), null);
  assert.equal(dealIdInPath(`/jobs/${A}`), null);
  assert.equal(dealIdInPath(null), null);
});
