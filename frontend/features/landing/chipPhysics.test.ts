import assert from 'node:assert/strict';
import test from 'node:test';
import { DRIFT_MAX, DRIFT_MIN, createBody, drift, reachesTarget, settled, startDrift, step, type Body } from './chipPhysics';

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

test('a chip knocked sideways by a moving one wakes and moves too', () => {
  const still = createBody({ x: 500, y: WORLD.height - 48, w: 160, h: 48, asleep: true });
  const mover = { ...createBody({ x: 330, y: WORLD.height - 48, w: 160, h: 48 }), vx: 900 };
  const [after] = run([still, mover], 0.2);
  assert.ok(after.x > 500, 'pushed along');
});

test('a resting chip whose support slides away falls', () => {
  const lower = { ...createBody({ x: 400, y: WORLD.height - 48, w: 160, h: 48 }), vx: 3000 };
  const upper = createBody({ x: 400, y: WORLD.height - 96, w: 160, h: 48, asleep: true });
  const rest = run([lower, upper], 3);
  assert.ok(rest[0].x > 560, 'the support slid out from under it');
  assert.ok(Math.abs(rest[1].y + 48 - WORLD.height) < 1, 'it fell to the floor instead of hanging in the air');
});

const bounds = { top: 0, width: WORLD.width, height: WORLD.height };
function float(bodies: Body[], seconds: number, onStep?: (next: Body[]) => void): Body[] {
  let current = bodies;
  for (let i = 0; i < seconds * 60; i += 1) {
    current = drift(current, bounds, DT);
    onStep?.(current);
  }
  return current;
}
const speed = (b: Body) => Math.hypot(b.vx, b.vy);

test('once landed, every chip floats slowly, never fast', () => {
  const pile = [0, 1, 2, 3].map((i) => createBody({ x: i * 200, y: WORLD.height - 48, w: 160, h: 48, asleep: true }));
  const floating = startDrift(pile);
  for (const b of floating) {
    assert.equal(b.asleep, false);
    assert.ok(speed(b) >= DRIFT_MIN - 0.01 && speed(b) <= DRIFT_MAX + 0.01, `${speed(b)} px/s`);
  }
  assert.ok(DRIFT_MAX <= 40, 'a bubble, not a ball');
  float(floating, 20, (next) => {
    for (const b of next) {
      assert.ok(speed(b) <= DRIFT_MAX + 0.01, 'never speeds up');
      assert.ok(speed(b) >= DRIFT_MIN - 0.01, 'never stops');
      assert.ok(b.x >= -0.01 && b.x + b.w <= WORLD.width + 0.01 && b.y >= -0.01 && b.y + b.h <= WORLD.height + 0.01, 'stays in the panel');
    }
  });
});

test('floating chips that meet bounce apart instead of passing through', () => {
  const a = { ...createBody({ x: 100, y: 200, w: 160, h: 48 }), vx: 30, vy: 0 };
  const b = { ...createBody({ x: 300, y: 200, w: 160, h: 48 }), vx: -30, vy: 0 };
  const after = float([a, b], 2);
  assert.ok(after[0].vx < 0 && after[1].vx > 0, 'they turned back');
  assert.ok(after[0].x + after[0].w <= after[1].x + 0.5, 'no overlap left');
});

test('a chip thrown while they float can still reach the chat bar, then calms down', () => {
  const bar = { x: 300, y: 0, w: 400, h: 60 };
  let reached = false;
  const thrown = { ...createBody({ x: 420, y: 400, w: 160, h: 48 }), vx: 0, vy: -1600, thrown: true };
  const [after] = float([thrown], 6, (next) => { if (reachesTarget(next[0], bar)) reached = true; });
  assert.ok(reached);
  assert.ok(speed(after) <= DRIFT_MAX + 0.01);
});
