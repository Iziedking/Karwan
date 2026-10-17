import assert from 'node:assert/strict';
import test from 'node:test';
import { ratingsCopy } from '../../shared/i18n/messages/ratings';
import { ratingText } from './ratingText';

/// "4.8 from 23 deals", or New under three ratings, never a misleading 5.0.
///
///   npx tsx --test features/ratings/ratingText.test.ts

const en = ratingsCopy.en;

test('a rated person shows the mean to one decimal and the count', () => {
  assert.equal(ratingText({ kind: 'rated', value: 4.8, count: 23 }, en, 'en'), '4.8 from 23 deals');
  assert.equal(ratingText({ kind: 'rated', value: 5, count: 3 }, en, 'en'), '5.0 from 3 deals');
});

test('fewer than three ratings shows New with how many so far', () => {
  assert.equal(ratingText({ kind: 'new', count: 0 }, en, 'en'), 'New, no ratings yet');
  assert.equal(ratingText({ kind: 'new', count: 1 }, en, 'en'), 'New, 1 rating so far');
  assert.equal(ratingText({ kind: 'new', count: 2 }, en, 'en'), 'New, 2 ratings so far');
});

test('ratings from disputed deals show beside the number', () => {
  assert.equal(ratingText({ kind: 'rated', value: 3.7, count: 3, disputed: 2 }, en, 'en'), '3.7 from 3 deals, 2 disputed');
});

test('the number follows the reader\'s locale', () => {
  assert.equal(ratingText({ kind: 'rated', value: 4.8, count: 23 }, ratingsCopy.fr, 'fr'), '4,8 sur 23 accords');
});
