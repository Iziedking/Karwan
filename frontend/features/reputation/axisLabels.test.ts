import assert from 'node:assert/strict';
import test from 'node:test';
import { pickAxisLabelIndices } from './axisLabels';

/// Evenly spaced x positions for `count` points across `width`, the same maths
/// the chart uses.
function positions(count: number, width = 360, pad = 32): number[] {
  return Array.from(
    { length: count },
    (_, i) => pad + ((width - pad * 2) * i) / Math.max(1, count - 1),
  );
}

test('never labels two points closer together than the gap', () => {
  const xs = positions(79);
  const picked = pickAxisLabelIndices(xs, { target: 4, minGap: 46 });
  for (let i = 1; i < picked.length; i++) {
    const gap = xs[picked[i]!]! - xs[picked[i - 1]!]!;
    assert.ok(gap >= 46, `labels ${picked[i - 1]} and ${picked[i]} are ${gap}px apart`);
  }
});

test('keeps the last point and drops the one that collides with it', () => {
  // The bug this exists for: a cadence of 19 over 79 points lands on 76, two
  // slots from the end, and the two labels overlapped on screen.
  const xs = positions(79);
  const picked = pickAxisLabelIndices(xs, { target: 4, minGap: 46 });
  assert.equal(picked[picked.length - 1], 78);
  assert.ok(!picked.includes(76));
  assert.equal(picked[0], 0);
});

test('a short series labels every point it has room for', () => {
  const xs = positions(3);
  assert.deepEqual(pickAxisLabelIndices(xs, { target: 4, minGap: 46 }), [0, 1, 2]);
});

test('degenerate series do not throw', () => {
  assert.deepEqual(pickAxisLabelIndices([], { target: 4 }), []);
  assert.deepEqual(pickAxisLabelIndices([12], { target: 4 }), [0]);
});

test('a narrow chart shows fewer labels than a wide one', () => {
  const narrow = pickAxisLabelIndices(positions(40, 360), { target: 4, minGap: 46 });
  const wide = pickAxisLabelIndices(positions(40, 1100, 40), { target: 6, minGap: 46 });
  assert.ok(wide.length >= narrow.length);
});
