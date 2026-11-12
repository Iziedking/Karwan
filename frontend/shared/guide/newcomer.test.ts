import assert from 'node:assert/strict';
import test from 'node:test';
import { SETTLED_IN_MS, whoIsThis } from './newcomer';

///   npx tsx --test shared/guide/newcomer.test.ts

const NOW = 1_800_000_000_000;
const read = { deals: 0, profileRead: true, setupDoneAt: undefined as number | undefined };

test('an account with a deal is known, on any device', () => {
  assert.equal(whoIsThis({ ...read, deals: 64 }, NOW), 'known');
  assert.equal(whoIsThis({ ...read, deals: 1 }, NOW), 'known');
});

test('a deal is enough before the profile has been read', () => {
  assert.equal(whoIsThis({ deals: 3, profileRead: false }, NOW), 'known');
});

test('an account set up more than a day ago is known', () => {
  assert.equal(whoIsThis({ ...read, setupDoneAt: NOW - SETTLED_IN_MS - 1 }, NOW), 'known');
  assert.equal(whoIsThis({ deals: null, profileRead: true, setupDoneAt: 1 }, NOW), 'known');
});

test('someone who finished setup today and has no deal is still new', () => {
  assert.equal(whoIsThis({ ...read, setupDoneAt: NOW - 60_000 }, NOW), 'new');
  assert.equal(whoIsThis(read, NOW), 'new');
});

test('nothing is decided until both reads are in', () => {
  assert.equal(whoIsThis({ deals: null, profileRead: true }, NOW), 'unknown');
  assert.equal(whoIsThis({ deals: 0, profileRead: false }, NOW), 'unknown');
  assert.equal(whoIsThis({ deals: null, profileRead: false }, NOW), 'unknown');
});
