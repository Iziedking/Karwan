import assert from 'node:assert/strict';
import test from 'node:test';
import { containsProhibitedCategory, skillCoverage } from './taxonomy.js';

/// Skill coverage widened by the word map (view 95); blocks stay literal (owner, 20 Nov 2026).
///
///   npx tsx --test src/matching/taxonomy.test.ts

test('skill coverage from before the map is unchanged', () => {
  assert.equal(skillCoverage(['react', 'typescript'], ['react developer']), 50);
  assert.equal(skillCoverage(['tailor'], ['tailor']), 100);
  assert.equal(skillCoverage([], ['tailor']), 0);
});

test('a fashion designer skill is covered by a tailor', () => {
  assert.equal(skillCoverage(['fashion designer'], ['tailor']), 100);
});

test('related but different work is not covered', () => {
  assert.equal(skillCoverage(['graphic designer'], ['tailor']), 0);
});

test('a block stays to the words the person wrote', () => {
  assert.equal(containsProhibitedCategory(['tailoring'], ['fashion designer']), false);
  assert.equal(containsProhibitedCategory(['tailor'], ['tailor']), true);
});
