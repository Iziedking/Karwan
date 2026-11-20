import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  dismissSuggestion,
  listOpenSuggestions,
  recordSuggestion,
  resetWordMapSuggestionsForTests,
} from './wordMapSuggestions.js';

/// Pairs the model judge matched that share no word, kept for the team (view 95),
/// on the memory store the tests use.
///
///   npx tsx --test src/db/wordMapSuggestions.test.ts

beforeEach(() => resetWordMapSuggestionsForTests());

test('the same pair is one suggestion with a rising count', async () => {
  await recordSuggestion(['wedding gown'], ['seamstress', 'bridal'], 10);
  await recordSuggestion(['Wedding  GOWN'], ['bridal', 'seamstress'], 20);
  const open = await listOpenSuggestions();
  assert.equal(open.length, 1);
  assert.deepEqual(open[0].briefWords, ['gown', 'wedding']);
  assert.deepEqual(open[0].sellerWords, ['bridal', 'seamstress']);
  assert.equal(open[0].count, 2);
  assert.equal(open[0].firstSeen, 10);
  assert.equal(open[0].lastSeen, 20);
});

test('a pair the map already bridges is not suggested', async () => {
  await recordSuggestion(['fashion designer'], ['tailor'], 10);
  assert.equal((await listOpenSuggestions()).length, 0);
});

test('filler alone on either side is not suggested', async () => {
  await recordSuggestion(['service'], ['tailor'], 10);
  assert.equal((await listOpenSuggestions()).length, 0);
});

test('most frequent first', async () => {
  await recordSuggestion(['roof leak'], ['plasterer'], 1);
  await recordSuggestion(['wedding gown'], ['bridal'], 2);
  await recordSuggestion(['wedding gown'], ['bridal'], 3);
  assert.deepEqual((await listOpenSuggestions()).map((s) => s.sellerWords[0]), ['bridal', 'plasterer']);
});

test('a dismissed pair leaves the list and is not reopened', async () => {
  await recordSuggestion(['wedding gown'], ['bridal'], 1);
  const [s] = await listOpenSuggestions();
  assert.equal(await dismissSuggestion(s.id), true);
  assert.equal((await listOpenSuggestions()).length, 0);
  await recordSuggestion(['wedding gown'], ['bridal'], 2);
  assert.equal((await listOpenSuggestions()).length, 0);
  assert.equal(await dismissSuggestion('missing'), false);
});

test('it keeps words only', async () => {
  await recordSuggestion(['wedding gown'], ['bridal'], 1);
  const [s] = await listOpenSuggestions();
  assert.deepEqual(Object.keys(s).sort(), ['briefWords', 'count', 'firstSeen', 'id', 'lastSeen', 'sellerWords']);
});
