import assert from 'node:assert/strict';
import test from 'node:test';
import { chosenCopy } from '../../shared/i18n/messages/chosen';
import { buyerChoiceLine } from './chosenPresentation';

const copy = chosenCopy.en;
const base = { sellerAgent: '0xagent', priceUsdc: '120.00', answerBy: 1_800_000_000_000 };

test('a waiting choice names the seller and the time, and can be taken back', () => {
  const line = buyerChoiceLine({ ...base, state: 'waiting' }, 'Ada', '12 Nov, 09:00', copy);
  assert.deepEqual(line, { template: 'Waiting for Ada to accept. They have until 12 Nov, 09:00.', amountUsdc: null, canTakeBack: true, approveUsdc: null });
});

test('a raised price can be approved or passed over', () => {
  const line = buyerChoiceLine({ ...base, state: 'raised', raisedPriceUsdc: '140.00' }, 'Ada', '', copy);
  assert.equal(line?.template, 'Ada asks for {amount}.');
  assert.equal(line?.amountUsdc, 140);
  assert.equal(line?.approveUsdc, 140);
  assert.equal(line?.canTakeBack, true);
});

test('a seller who said no leaves only choosing another offer', () => {
  const line = buyerChoiceLine({ ...base, state: 'declined' }, 'Ada', '', copy);
  assert.equal(line?.template, 'Ada turned this down. Choose another offer.');
  assert.equal(line?.canTakeBack, false);
  assert.equal(line?.approveUsdc, null);
});

test('no choice, no line', () => {
  assert.equal(buyerChoiceLine(null, 'Ada', '', copy), null);
});

test('every language has every line, with its slots and no long dash', () => {
  const slots: Array<[keyof typeof copy, string[]]> = [
    ['sellerLine', ['{title}', '{amount}']], ['answerBy', ['{date}']], ['askedForMore', ['{amount}']],
    ['waiting', ['{name}', '{date}']], ['raised', ['{name}', '{amount}']], ['approve', ['{amount}']], ['declined', ['{name}']],
  ];
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    const c = chosenCopy[locale];
    assert.deepEqual(Object.keys(c).sort(), Object.keys(copy).sort(), locale);
    for (const [key, want] of slots) for (const slot of want) assert.ok(c[key].includes(slot), `${locale}.${key} ${slot}`);
    for (const value of Object.values(c)) {
      assert.ok(value.length > 0, locale);
      assert.doesNotMatch(value, /—/, locale);
    }
  }
});
