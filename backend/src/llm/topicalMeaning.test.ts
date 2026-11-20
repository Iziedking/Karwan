import assert from 'node:assert/strict';
import test from 'node:test';
import { topicalMatchScore, topicalOverlap } from './keywords.js';

/// Word matching widened by the word map (view 95): the same work under another
/// name now meets, and nothing that met before scores lower.
///
///   npx tsx --test src/llm/topicalMeaning.test.ts

test('scores from before the map stay exactly as they were', () => {
  const cases: Array<[string[], string[], number]> = [
    [['data science', 'machine learning'], ['data science', 'machine learning', 'python'], 100],
    [['data science', 'machine learning'], ['data analyst'], 25],
    [['amazon account'], ['outlier account'], 0],
    [['amazon account'], ['amazon seller'], 100],
    [['logo design'], ['graphic designer', 'logo'], 100],
    [['api service'], ['backend engineer'], 0],
    [['phone repair'], ['phone accessories'], 50],
    [['tailor'], ['tailor'], 100],
  ];
  for (const [brief, seller, score] of cases) {
    assert.equal(topicalMatchScore(brief, seller), score, `${brief} vs ${seller}`);
  }
  assert.equal(topicalOverlap(['amazon account'], ['outlier account']), 0);
  assert.equal(topicalOverlap(['amazon account'], ['amazon seller']), 1);
});

test('a fashion designer request fully matches a tailor', () => {
  assert.equal(topicalMatchScore(['fashion designer'], ['tailor']), 100);
  assert.equal(topicalMatchScore(['tailoring'], ['fashion designer']), 100);
  assert.ok(topicalOverlap(['fashion designer'], ['tailor']) > 0);
});

test('the request as written: fashion and designer meet tailor, clothes does not', () => {
  // fashion, designer, clothes are the meaningful words ("for" is filler, "my" too short).
  // fashion and designer meet through the tailoring group; clothes is not on the seller side: 2 of 3.
  assert.equal(topicalMatchScore(['Fashion Designer for my clothes'], ['Tailor, native and English wears']), 67);
});

test('related but different work does not meet', () => {
  assert.equal(topicalMatchScore(['graphic designer'], ['tailor']), 0);
  assert.equal(topicalMatchScore(['designer'], ['tailor']), 0);
  assert.equal(topicalOverlap(['graphic designer'], ['tailor']), 0);
});

test('a short name counts when both sides share its group', () => {
  // party is meaningful, dj joins because both sides are in the music group: 1 of 2.
  assert.equal(topicalMatchScore(['DJ for my party'], ['disc jockey']), 50);
});

test('an empty side or only filler still scores 0', () => {
  assert.equal(topicalMatchScore([], ['tailor']), 0);
  assert.equal(topicalMatchScore(['service'], ['tailor']), 0);
  assert.equal(topicalOverlap([], ['tailor']), 0);
});
