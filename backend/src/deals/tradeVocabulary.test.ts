import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deliverableBare,
  deliverableNoun,
  startPhrase,
  tradeTypeOf,
  type TradeType,
} from './tradeVocabulary.js';

const ALL: TradeType[] = ['service', 'goods', 'mixed'];

test('a deal without a trade type reads as service', () => {
  assert.equal(tradeTypeOf(undefined), 'service');
  assert.equal(tradeTypeOf(null), 'service');
  assert.equal(tradeTypeOf({}), 'service');
  assert.equal(tradeTypeOf({ tradeType: null }), 'service');
});

test('a deal with a trade type keeps it', () => {
  for (const trade of ALL) assert.equal(tradeTypeOf({ tradeType: trade }), trade);
});

test('the freelance wording is reserved for service deals', () => {
  assert.equal(startPhrase('service'), 'begin the work');
  assert.equal(deliverableNoun('service'), 'the work');
  // The bug: a supplies trade was told to begin the work.
  assert.ok(!startPhrase('goods').includes('work'));
  assert.ok(!deliverableNoun('goods').includes('work'));
  assert.ok(!startPhrase('mixed').includes('work'));
  assert.ok(!deliverableNoun('mixed').includes('work'));
});

test('every trade type has its own words', () => {
  const starts = new Set(ALL.map(startPhrase));
  const nouns = new Set(ALL.map(deliverableNoun));
  assert.equal(starts.size, ALL.length);
  assert.equal(nouns.size, ALL.length);
});

test('the phrases read as written into their sentences', () => {
  for (const trade of ALL) {
    // "You can ..." and "The seller can ..." both take a bare verb.
    assert.match(startPhrase(trade), /^[a-z]+ the [a-z]+$/);
    // "marked ... delivered" takes an article.
    assert.match(deliverableNoun(trade), /^the [a-z]+$/);
    assert.equal(deliverableBare(trade), deliverableNoun(trade).slice(4));
  }
});
