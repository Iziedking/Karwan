import assert from 'node:assert/strict';
import test from 'node:test';
import { createBody, reachesTarget, settled, step, type Body } from './chipPhysics';

const WORLD = { width: 1000, height: 500 };
const DT = 1 / 60;

function run(bodies: Body[], seconds: number, onStep?: (next: Body[], impacts: number[]) => void): Body[] {
  let current = bodies;
  for (let i = 0; i < seconds * 60; i += 1) {
    const result = step(current, WORLD, DT);
    current = result.bodies;
    onStep?.(current, result.impacts);
  }
  return current;
}

test('a dropped chip bounces twice, then rests on the floor', () => {
  let impacts = 0;
  let lastY = 0;
  const [chip] = run([createBody({ x: 100, y: 0, w: 200, h: 48 })], 4, (next, hit) => {
    impacts += hit.length;
    lastY = next[0].y;
  });
  assert.equal(impacts, 3, 'lands, then bounces twice');
  assert.equal(chip.y, WORLD.height - 48);
  assert.equal(lastY, WORLD.height - 48);
  assert.equal(chip.vy, 0);
  assert.ok(settled([chip]));
});

test('walls keep a thrown chip inside the panel', () => {
  const [chip] = run([{ ...createBody({ x: 800, y: 200, w: 150, h: 48 }), vx: 3000, vy: -200 }], 3, (next) => {
    assert.ok(next[0].x >= 0 && next[0].x + 150 <= WORLD.width, 'stays between the walls');
    assert.ok(next[0].y >= 0, 'stays under the top');
  });
  assert.ok(settled([chip]));
});

test('chips dropped on the same spot come to rest without overlapping', () => {
  const rest = run([createBody({ x: 300, y: 0, w: 180, h: 48 }), createBody({ x: 330, y: -120, w: 180, h: 48 }), createBody({ x: 280, y: -240, w: 180, h: 48 })], 6);
  for (let i = 0; i < rest.length; i += 1) {
    for (let j = i + 1; j < rest.length; j += 1) {
      const a = rest[i];
      const b = rest[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(overlapX <= 0.5 || overlapY <= 0.5, `chips ${i} and ${j} overlap`);
    }
    assert.ok(rest[i].y + rest[i].h <= WORLD.height + 0.01);
  }
  assert.ok(settled(rest));
});

test('a chip thrown up into the chat bar reaches it; one falling past it or bouncing does not', () => {
  const bar = { x: 300, y: 20, w: 400, h: 60 };
  let reached = false;
  run([{ ...createBody({ x: 420, y: 400, w: 160, h: 48 }), vy: -1800, thrown: true }], 1, (next) => {
    if (reachesTarget(next[0], bar)) reached = true;
  });
  assert.ok(reached);
  const falling = { ...createBody({ x: 420, y: 40, w: 160, h: 48 }), vy: 300, thrown: true };
  assert.equal(reachesTarget(falling, bar), false);
  const bounced = { ...createBody({ x: 420, y: 40, w: 160, h: 48 }), vy: -300 };
  assert.equal(reachesTarget(bounced, bar), false, 'a chip that only bounced is never sent');
});

test('a resting world asks for no more frames', () => {
  assert.equal(settled([createBody({ x: 0, y: 452, w: 100, h: 48, asleep: true })]), true);
  assert.equal(settled([createBody({ x: 0, y: 0, w: 100, h: 48 })]), false);
});
