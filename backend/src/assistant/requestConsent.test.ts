import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPostRequestConfirm } from './actions.js';

test('request card explains the existing pre-authorised funding instead of promising another approval', () => {
  const card = buildPostRequestConfirm({ caller: '0x' + 'a'.repeat(40), brief: 'Supply printed packaging', budgetUsdc: 100, deadlineDays: 7 });
  assert.ok(!('error' in card));
  assert.match(card.summary, /authorises.*fund/);
  assert.match(card.summary, /Another buyer funding click may not be required/);
  assert.doesNotMatch(JSON.stringify(card), /Nothing is paid until|developers/);
  assert.equal(card.intent, 'post_request');
  assert.equal(card.payload.budgetUsdc, 100);
});
