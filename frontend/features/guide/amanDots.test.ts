import assert from 'node:assert/strict';
import test from 'node:test';
import { amanDots, discCells, HALO, PATCH, type AmanMood, type Dot, type Feature } from './amanDots';

const MOODS: AmanMood[] = ['idle', 'talking', 'thinking', 'pleased', 'waiting'];

const kinds = (mood: AmanMood) => amanDots(mood).features.map((f) => f.kind);

function eyeAt(face: { features: Feature[] }, n: number) {
  const eye = face.features.filter((f) => f.kind === 'eye')[n];
  if (!eye || eye.kind !== 'eye') throw new Error('no eye');
  return eye;
}

function box(f: Feature): { x0: number; y0: number; x1: number; y1: number } {
  if (f.kind === 'eye' || f.kind === 'mouth') {
    return { x0: f.cx - f.rx - PATCH, y0: f.cy - f.ry - PATCH, x1: f.cx + f.rx + PATCH, y1: f.cy + f.ry + PATCH };
  }
  if (f.kind === 'bar') return { x0: f.x - PATCH, y0: f.y - PATCH, x1: f.x + f.w + PATCH, y1: f.y + f.h + PATCH };
  const n = f.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  const g = HALO / 2;
  return { x0: Math.min(...xs) - g, y0: Math.min(...ys) - g, x1: Math.max(...xs) + g, y1: Math.max(...ys) + g };
}

function clearance(d: Dot, f: Feature): number {
  const b = box(f);
  const dx = Math.max(b.x0 - d.cx, 0, d.cx - b.x1);
  const dy = Math.max(b.y0 - d.cy, 0, d.cy - b.y1);
  return Math.hypot(dx, dy) - d.r;
}

test('the disc holds 61 cells and 24 of them are rim', () => {
  const all = discCells();
  assert.equal(all.length, 61);
  assert.equal(all.filter((c) => c.rim).length, 24);
});

test('no dot comes within 1.2 of a feature, in every mood', () => {
  for (const mood of MOODS) {
    const { dots, features } = amanDots(mood);
    assert.ok(dots.length > 30, `${mood} keeps most of its dots`);
    for (const d of dots) for (const f of features) assert.ok(clearance(d, f) >= 1.2, `${mood} ${d.cx},${d.cy}`);
  }
});

test('idle eyes sit right of centre', () => {
  const eyes = amanDots('idle').features.filter((f) => f.kind === 'eye');
  assert.ok(eyes.reduce((s, e) => s + (e as { cx: number }).cx, 0) / eyes.length > 48);
});

test('each mood has its features', () => {
  assert.deepEqual(kinds('idle'), ['eye', 'eye']);
  assert.deepEqual(kinds('talking'), ['eye', 'eye', 'mouth']);
  assert.deepEqual(kinds('thinking'), ['eye', 'eye', 'bar']);
  assert.deepEqual(kinds('pleased'), ['arc', 'arc', 'arc']);
  assert.deepEqual(kinds('waiting'), ['eye', 'eye']);
});

test('gaze moves the eyes up to 3 and leaves the dots alone', () => {
  const rest = amanDots('idle');
  const look = amanDots('idle', { x: 5, y: -1 });
  assert.deepEqual(look.dots, rest.dots);
  assert.equal(eyeAt(look, 0).cx - eyeAt(rest, 0).cx, 3);
  assert.equal(eyeAt(look, 0).cy - eyeAt(rest, 0).cy, -3);
  assert.equal(eyeAt(look, 0).glint.cx - eyeAt(rest, 0).glint.cx, 3);
});

test('a mirrored gaze mirrors the move', () => {
  assert.equal(eyeAt(amanDots('idle', { x: -1, y: 0 }), 0).cx, eyeAt(amanDots('idle'), 0).cx - 3);
});
