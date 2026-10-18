import assert from 'node:assert/strict';
import test from 'node:test';
import { afterBusinessSetup, shouldAskTradesAs } from './entryQuestion';

/// The market asks once whether someone trades for themselves or a business
/// (view 17), and never asks someone who already said or has a business.
///
///   npx tsx --test features/market/entryQuestion.test.ts

test('a first visit while signed in asks', () => {
  assert.equal(shouldAskTradesAs({ signedIn: true, hasBusinessWorkspace: false, answer: undefined, profileLoaded: true }), true);
});

test('never asks someone signed out, with a business, or who answered', () => {
  assert.equal(shouldAskTradesAs({ signedIn: false, hasBusinessWorkspace: false, answer: undefined, profileLoaded: true }), false);
  assert.equal(shouldAskTradesAs({ signedIn: true, hasBusinessWorkspace: true, answer: undefined, profileLoaded: true }), false);
  assert.equal(shouldAskTradesAs({ signedIn: true, hasBusinessWorkspace: false, answer: 'self', profileLoaded: true }), false);
  assert.equal(shouldAskTradesAs({ signedIn: true, hasBusinessWorkspace: false, answer: 'business', profileLoaded: true }), false);
});

test('waits for the profile, so a saved answer never flashes the question', () => {
  assert.equal(shouldAskTradesAs({ signedIn: true, hasBusinessWorkspace: false, answer: undefined, profileLoaded: false }), false);
});

test('business setup returns to the market when it was opened from there', () => {
  assert.equal(afterBusinessSetup('/market'), '/market');
  assert.equal(afterBusinessSetup(null), '/business/verification');
});

test('business setup never follows a link off Karwan', () => {
  assert.equal(afterBusinessSetup('//evil.example'), '/business/verification');
  assert.equal(afterBusinessSetup('https://evil.example'), '/business/verification');
});
