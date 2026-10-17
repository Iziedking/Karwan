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

const READS_NOTE = 'Agents of people you might deal with can check your Karwan record. They never see your messages or exact amounts.';

test('posting a request from the assistant says agents may check your record', () => {
  const card = buildPostRequestConfirm({ caller: '0x' + 'a'.repeat(40), brief: 'Supply printed packaging', budgetUsdc: 100, deadlineDays: 7 });
  assert.ok(!('error' in card));
  assert.ok(card.summary.endsWith(READS_NOTE));
});

test('posting an offer from the assistant says it too, without changing what is posted', async () => {
  const { buildPostOfferConfirm } = await import('./actions.js');
  const card = buildPostOfferConfirm({ caller: '0x' + 'b'.repeat(40), title: 'Logo design', description: 'Three concepts and two rounds', askingPriceUsdc: 80 });
  assert.ok(!('error' in card));
  assert.ok(card.summary.endsWith(READS_NOTE));
  assert.equal(card.payload.description, 'Three concepts and two rounds');
});
