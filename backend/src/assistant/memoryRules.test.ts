import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_NOTES, mergeNotes, safeNote, saysDoNotRemember, type MemoryNote } from './memoryRules.js';

/// What the assistant may keep about a person, checked in code, not only asked
/// of the model.
///
///   npx tsx --test src/assistant/memoryRules.test.ts

test('a plain note is kept, trimmed to one line of at most 200 characters', () => {
  assert.equal(safeNote('  Wants 12 rolls of branded tape,\nshipped to Lagos  '), 'Wants 12 rolls of branded tape, shipped to Lagos');
  assert.equal(safeNote('x'.repeat(300))!.length, 200);
  assert.equal(safeNote('   '), null);
});

test('secrets, numbers that identify money, addresses and emails are never kept', () => {
  for (const text of [
    'Their password is hunter2',
    'PIN 4821 for the card',
    'Seed phrase: apple banana cherry',
    'private key starts with 9f',
    'Card 4111 1111 1111 1111',
    'Account number 0123456789 at GTBank',
    'Phone +234 803 123 4567',
    'Wallet 0x7a3b9c1d2e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
    'Email them at ada@example.com',
  ]) assert.equal(safeNote(text), null, text);
});

test('ordinary numbers, prices and tags stay', () => {
  assert.equal(safeNote('Budget about 300 USDC, buys from @madie'), 'Budget about 300 USDC, buys from @madie');
  assert.equal(safeNote('Wants delivery by 14 Nov 2026'), 'Wants delivery by 14 Nov 2026');
});

test('a person who asks not to be remembered is not', () => {
  for (const text of ["don't remember this", 'Please do not save this', 'keep this private', 'off the record: I am moving']) {
    assert.equal(saysDoNotRemember(text), true, text);
  }
  assert.equal(saysDoNotRemember('Remember I ship to Lagos'), false);
});

const note = (id: string, text: string, at: number): MemoryNote => ({ id, text, at });

test('new notes join, duplicates do not, replaced notes go, and the oldest drop past the cap', () => {
  let n = 0;
  const id = () => `n${++n}`;
  const existing = [note('a', 'Sells logo design', 1), note('b', 'Budget about 200 USDC', 2)];
  const out = mergeNotes(existing, { add: ['sells logo design', 'Budget about 300 USDC'], replace: ['b'] }, 10, id);
  assert.deepEqual(out.map((x) => x.text), ['Sells logo design', 'Budget about 300 USDC']);
  assert.equal(out[1].at, 10);

  const full = Array.from({ length: MAX_NOTES }, (_, i) => note(`f${i}`, `Note ${i}`, i));
  const capped = mergeNotes(full, { add: ['Newest'], replace: [] }, 999, id);
  assert.equal(capped.length, MAX_NOTES);
  assert.equal(capped[0].text, 'Note 1');
  assert.equal(capped.at(-1)!.text, 'Newest');
});

test('unsafe notes from the writer are dropped on the way in', () => {
  const out = mergeNotes([], { add: ['Card 4111 1111 1111 1111', 'Ships to Kano'], replace: [] }, 1, () => 'x');
  assert.deepEqual(out.map((x) => x.text), ['Ships to Kano']);
});
