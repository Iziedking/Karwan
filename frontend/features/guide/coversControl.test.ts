import assert from 'node:assert/strict';
import test from 'node:test';
import { coversControl } from './coversControl';

interface Fake {
  name: string;
  control: boolean;
  box: { left: number; top: number; right: number; bottom: number };
  closest(selector: string): unknown;
}

const el = (name: string, control: boolean, left: number, top: number, width: number, height: number): Fake => ({
  name,
  control,
  box: { left, top, right: left + width, bottom: top + height },
  closest() {
    return this.control ? this : null;
  },
});

const page = (items: Fake[]) => (x: number, y: number) =>
  items.filter((i) => x >= i.box.left && x < i.box.right && y >= i.box.top && y < i.box.bottom);

const note = { left: 16, top: 400, width: 340, height: 110 };
const own = el('note', false, 16, 400, 340, 110);
const ownButton = el('note button', true, 32, 460, 140, 40);
const isOwn = (e: Fake) => e === own || e === ownButton;

test('a note over plain text covers nothing', () => {
  const text = el('paragraph', false, 0, 380, 460, 200);
  assert.equal(coversControl(note, page([own, ownButton, text]), isOwn), false);
});

test('a note over a button covers it, and its own button does not count', () => {
  const record = el('Record a session', true, 50, 420, 160, 52);
  assert.equal(coversControl(note, page([own, ownButton]), isOwn), false);
  assert.equal(coversControl(note, page([own, ownButton, record]), isOwn), true);
});

test('a small control anywhere under the note is found', () => {
  for (const [left, top] of [[18, 402], [310, 404], [20, 462], [308, 464], [170, 440]] as const) {
    const tab = el('tab', true, left, top, 44, 44);
    assert.equal(coversControl(note, page([own, tab]), isOwn), true, `${left},${top}`);
  }
});

test('a button beside or below the note is left alone', () => {
  const help = el('Help', true, 366, 420, 90, 48);
  const bar = el('Home tab', true, 0, 520, 92, 60);
  assert.equal(coversControl(note, page([own, help, bar]), isOwn), false);
});

test('a note with no size covers nothing', () => {
  const record = el('Record a session', true, 0, 0, 460, 600);
  assert.equal(coversControl({ left: 0, top: 0, width: 0, height: 0 }, page([record]), isOwn), false);
});
