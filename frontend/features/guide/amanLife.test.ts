import assert from 'node:assert/strict';
import test from 'node:test';
import { blinkDelay } from './amanMotion';
import { BLINK_MS, BREATH_MS, aimAt, blinkPlan, breathOffset, gazeToward, lifeAllowed } from './amanLife';

/// Aman alive (view 57, 15 Nov evening): every face blinks, looks and breathes.

test('a blink comes every 4 to 7 seconds, closed for 120 ms, and every fourth is double', () => {
  assert.equal(BLINK_MS, 120);
  for (let n = 0; n < 8; n += 1) {
    const plan = blinkPlan(7, n);
    assert.equal(plan.delay, blinkDelay(7, n));
    assert.ok(plan.delay >= 4000 && plan.delay <= 7000);
    assert.equal(plan.double, n % 4 === 3, `blink ${n}`);
  }
});

test('breathing is a 4 second cycle between 0 and 1', () => {
  assert.equal(BREATH_MS, 4000);
  assert.equal(breathOffset(0), 0);
  assert.ok(Math.abs(breathOffset(2000) - 1) < 1e-9);
  assert.ok(Math.abs(breathOffset(4000)) < 1e-9);
  for (let t = 0; t < 8000; t += 250) {
    const b = breathOffset(t);
    assert.ok(b >= 0 && b <= 1, `t=${t}`);
  }
});

test('the eyes follow a point within 400 px, and rest centred past it', () => {
  const face = { x: 100, y: 100 };
  assert.deepEqual(gazeToward(face, { x: 600, y: 100 }), { x: 0, y: 0 });
  const right = gazeToward(face, { x: 260, y: 100 });
  assert.ok(Math.abs(right.x - 1) < 1e-9 && Math.abs(right.y) < 1e-9);
  const near = gazeToward(face, { x: 100, y: 180 });
  assert.ok(Math.abs(near.y - 0.5) < 1e-9);
  assert.deepEqual(gazeToward(face, face), { x: 0, y: 0 });
});

test('a face is still with reduced motion, on the still level or in a hidden tab, and only blinks on lite', () => {
  assert.equal(lifeAllowed({ reduced: true, level: 'full', hidden: false }), 'none');
  assert.equal(lifeAllowed({ reduced: false, level: 'still', hidden: false }), 'none');
  assert.equal(lifeAllowed({ reduced: false, level: 'full', hidden: true }), 'none');
  assert.equal(lifeAllowed({ reduced: false, level: 'lite', hidden: false }), 'blink');
  assert.equal(lifeAllowed({ reduced: false, level: 'full', hidden: false }), 'full');
});

test('in a tour Aman looks straight at the part, whatever the distance', () => {
  assert.deepEqual(aimAt({ x: 0, y: 0 }, { x: 900, y: 0 }), { x: 1, y: 0 });
  const down = aimAt({ x: 10, y: 10 }, { x: 10, y: 30 });
  assert.ok(Math.abs(down.y - 1) < 1e-9 && Math.abs(down.x) < 1e-9);
  assert.deepEqual(aimAt({ x: 5, y: 5 }, { x: 5, y: 5 }), { x: 0, y: 0 });
});
