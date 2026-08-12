import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinancingParty } from './channelAccess.js';

test('only the seller and financier can access a financing position', () => {
  assert.equal(isFinancingParty('0xSeller', '0xseller', '0xfinancier'), true);
  assert.equal(isFinancingParty('0xFinancier', '0xseller', '0xfinancier'), true);
  assert.equal(isFinancingParty('0xBuyer', '0xseller', '0xfinancier'), false);
  assert.equal(isFinancingParty('0xUnrelated', '0xseller', '0xfinancier'), false);
});
