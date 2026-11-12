import assert from 'node:assert/strict';
import test from 'node:test';
import { besideLauncher } from './besideLauncher';

const SCREEN = 700;
// Both sit 96 px above the bottom edge on a phone.
const note = { start: 16, top: 483, bottom: 604 };
const help = (start: number) => ({ start, top: 556, bottom: 604 });

test('with no Help button the note keeps its own width', () => {
  assert.deepEqual(besideLauncher(note, null, SCREEN), { maxWidth: null, bottom: null });
});

test('on a 460 px screen the note stops short of the Help button', () => {
  // The live case, 12 Nov 2026: Help spans 345 to 444, the note ran to 372.
  const fit = besideLauncher(note, help(345), SCREEN);
  assert.deepEqual(fit, { maxWidth: 317, bottom: null });
  assert.ok(note.start + fit.maxWidth! < 345);
});

test('a Help button on another row changes nothing', () => {
  // From 768 px the Help button drops to the corner, below the note.
  assert.deepEqual(besideLauncher(note, { start: 649, top: 632, bottom: 680 }, SCREEN), { maxWidth: null, bottom: null });
});

test('a Help button far to the side leaves the room it leaves', () => {
  const fit = besideLauncher({ start: 316, top: 559, bottom: 680 }, { start: 1161, top: 632, bottom: 680 }, SCREEN);
  assert.equal(fit.maxWidth, 833);
  assert.equal(fit.bottom, null);
});

test('with too little room the note sits above the Help button', () => {
  // A 320 px screen with a long label: 172 px would break the line into single words.
  const fit = besideLauncher(note, help(200), SCREEN);
  assert.deepEqual(fit, { maxWidth: null, bottom: 156 });
});
