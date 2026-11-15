import assert from 'node:assert/strict';
import test from 'node:test';
import { FACE, GAP, placeAman } from './placeAman';

const phone = { width: 390, height: 844 };
const line = { width: 240, height: 64 };

test('docks at the inline end above the bottom bar', () => {
  const p = placeAman({ viewport: phone, anchor: null, bottomBar: 80, rtl: false, lineSize: null });
  assert.deepEqual(p.face, { x: 390 - 16 - 56, y: 844 - 80 - 16 - 56 });
  assert.equal(p.line, null);
});

test('sits under an on-screen anchor with the line beside it', () => {
  const p = placeAman({ viewport: phone, anchor: { left: 20, top: 120, width: 350, height: 150 }, bottomBar: 80, rtl: false, lineSize: line });
  assert.equal(p.face.y, 270 + GAP);
  assert.ok(p.line);
  assert.ok(p.line.x + p.line.maxWidth <= p.face.x - GAP);
  assert.ok(p.line.x >= 16);
});

test('goes above the anchor when below would reach the bottom bar', () => {
  const anchor = { left: 20, top: 560, width: 350, height: 140 };
  const p = placeAman({ viewport: phone, anchor, bottomBar: 80, rtl: false, lineSize: line });
  assert.ok(p.face.y + FACE <= anchor.top - GAP);
});

test('treats an off-screen anchor as none', () => {
  const docked = placeAman({ viewport: phone, anchor: null, bottomBar: 80, rtl: false, lineSize: line });
  const p = placeAman({ viewport: phone, anchor: { left: 20, top: -400, width: 350, height: 150 }, bottomBar: 80, rtl: false, lineSize: line });
  assert.deepEqual(p, docked);
});

test('mirrors in RTL', () => {
  const p = placeAman({ viewport: phone, anchor: null, bottomBar: 80, rtl: true, lineSize: line });
  assert.equal(p.face.x, 16);
  assert.ok(p.line);
  assert.ok(p.line.x >= p.face.x + FACE + GAP);
  assert.ok(p.line.x + p.line.maxWidth <= 390 - 16);
});

test('never off screen and the line is at most 220 wide on 320', () => {
  const p = placeAman({ viewport: { width: 320, height: 568 }, anchor: null, bottomBar: 72, rtl: false, lineSize: { width: 400, height: 120 } });
  assert.ok(p.line);
  assert.ok(p.line.maxWidth <= 220);
  assert.ok(p.line.x >= 16 && p.face.x + 56 <= 320 - 16);
  assert.ok(p.line.y >= 0 && p.line.y + 120 <= p.face.y + FACE);
});

test('a laptop uses 24 from the edge and no bar', () => {
  const p = placeAman({ viewport: { width: 1440, height: 900 }, anchor: null, bottomBar: 0, rtl: false, lineSize: null });
  assert.deepEqual(p.face, { x: 1440 - 24 - 56, y: 900 - 24 - 56 });
});
