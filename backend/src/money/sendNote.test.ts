import assert from 'node:assert/strict';
import test from 'node:test';
import { NOTE_MAX, cleanNote } from './sendNote.js';

test('a note is trimmed and its spaces folded', () => {
  assert.equal(cleanNote('  Logo,   first\n draft  '), 'Logo, first draft');
});

test('an empty or missing note is no note', () => {
  assert.equal(cleanNote(''), null);
  assert.equal(cleanNote('   '), null);
  assert.equal(cleanNote(undefined), null);
  assert.equal(cleanNote(null), null);
});

test('control characters never reach the other person', () => {
  assert.equal(cleanNote('rent\u0000\u0007 for May‮'), 'rent for May');
});

test(`a note is at most ${NOTE_MAX} characters`, () => {
  assert.equal(cleanNote('a'.repeat(300))?.length, NOTE_MAX);
});
