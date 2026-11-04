/// Small physics for the chips on the landing (section 5, view 49): gravity,
/// a floor and walls that bounce, chips that pile on each other and rest;
/// then, once landed, a slow float where they drift and nudge each other.
/// Pure, so the bounce is tested; the component only draws the result.

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /// Held by the pointer: physics leaves it where the hand puts it.
  held: boolean;
  /// Let go by a hand and still moving. Only a thrown chip can be sent.
  thrown: boolean;
  asleep: boolean;
  restFrames: number;
}

export interface World {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GRAVITY = 2400;
/// Kept speed after a bounce. With BOUNCE_FLOOR this lands a dropped chip, then
/// bounces it twice before it settles.
const RESTITUTION = 0.42;
/// Slower than this, a contact settles instead of bouncing.
const BOUNCE_FLOOR = 140;
const GROUND_FRICTION = 0.85;
const SLEEP_SPEED = 5;
const SLEEP_FRAMES = 10;

export function createBody({ x, y, w, h, asleep = false }: { x: number; y: number; w: number; h: number; asleep?: boolean }): Body {
  return { x, y, w, h, vx: 0, vy: 0, held: false, thrown: false, asleep, restFrames: 0 };
}

/// A downward contact at `speed`: the speed it leaves with, and whether it
/// was hard enough to count as a landing.
function bounce(speed: number): { vy: number; impact: boolean } {
  if (speed < BOUNCE_FLOOR) return { vy: 0, impact: false };
  const kept = speed * RESTITUTION;
  return { vy: kept >= BOUNCE_FLOOR ? -kept : 0, impact: true };
}

/// Whether something holds `b` up: the floor, or a chip right under it.
function restsOnSomething(b: Body, i: number, all: readonly Body[], world: World): boolean {
  if (b.y + b.h >= world.height - 0.5) return true;
  return all.some((c, j) => j !== i && Math.abs(c.y - (b.y + b.h)) < 1 && Math.min(b.x + b.w, c.x + c.w) - Math.max(b.x, c.x) > 0);
}

export function step(bodies: readonly Body[], world: World, dt: number): { bodies: Body[]; impacts: number[] } {
  const next = bodies.map((b) => ({ ...b }));
  const impacts: number[] = [];
  const supported = new Array(next.length).fill(false);

  // A resting chip whose support moved away falls again.
  next.forEach((b, i) => {
    if (b.asleep && !b.held && !restsOnSomething(b, i, next, world)) {
      b.asleep = false;
      b.restFrames = 0;
    }
  });

  for (const b of next) {
    if (b.held || b.asleep) continue;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const a = next[i];
        const c = next[j];
        const overlapX = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
        const overlapY = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapY <= overlapX) {
          const [upper, lower, u] = a.y < c.y ? [a, c, i] : [c, a, j];
          if (upper.held) continue;
          if (upper.asleep && !lower.asleep && !lower.held) {
            // A chip thrown up from under the pile lifts the one resting on it.
            if (lower.vy < -BOUNCE_FLOOR) {
              upper.asleep = false;
              upper.restFrames = 0;
              upper.vy = lower.vy;
              upper.vx = lower.vx / 2;
              upper.y = lower.y - upper.h;
              continue;
            }
            lower.y = upper.y + upper.h;
            continue;
          }
          upper.y = lower.y - upper.h;
          // Only a chip that is itself resting can hold another one up; on a
          // falling chip the upper one just falls with it.
          const lowerRests = lower.asleep || lower.held || lower.restFrames > 0;
          if (!lowerRests) {
            upper.vy = Math.min(upper.vy, lower.vy);
          } else {
            if (upper.vy > 0) {
              const hit = bounce(upper.vy);
              if (hit.impact) impacts.push(u);
              upper.vy = hit.vy;
            }
            if (upper.vy === 0) supported[u] = true;
          }
        } else {
          const [left, right] = a.x < c.x ? [a, c] : [c, a];
          // A chip hit hard from the side is knocked awake, not a wall.
          for (const [hit, by] of [[left, right], [right, left]] as const) {
            if (hit.asleep && !by.asleep && Math.abs(by.vx) > BOUNCE_FLOOR) {
              hit.asleep = false;
              hit.restFrames = 0;
            }
          }
          const push = overlapX / 2 + 0.01;
          if (!left.held && !left.asleep) left.x -= right.held || right.asleep ? overlapX + 0.01 : push;
          if (!right.held && !right.asleep) right.x += left.held || left.asleep ? overlapX + 0.01 : push;
          const swap = left.vx;
          left.vx = Math.min(0, right.vx) * RESTITUTION;
          right.vx = Math.max(0, swap) * RESTITUTION;
        }
      }
    }
  }

  next.forEach((b, i) => {
    if (b.held) return;
    if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) * RESTITUTION; }
    if (b.x + b.w > world.width) { b.x = world.width - b.w; b.vx = -Math.abs(b.vx) * RESTITUTION; }
    // Chips drop in from above, so the top only stops a chip thrown upward.
    if (b.y < 0 && b.vy < 0) { b.y = 0; b.vy = -b.vy * RESTITUTION; }
    if (b.y + b.h >= world.height) {
      b.y = world.height - b.h;
      if (b.vy > 0) {
        const hit = bounce(b.vy);
        if (hit.impact) impacts.push(i);
        b.vy = hit.vy;
      }
      if (b.vy === 0) supported[i] = true;
    }
    if (supported[i]) b.vx *= GROUND_FRICTION;
    if (b.asleep) return;
    const still = supported[i] && Math.abs(b.vx) < SLEEP_SPEED && Math.abs(b.vy) < SLEEP_SPEED;
    b.restFrames = still ? b.restFrames + 1 : 0;
    if (b.restFrames >= SLEEP_FRAMES) {
      b.asleep = true;
      b.thrown = false;
      b.vx = 0;
      b.vy = 0;
    }
  });

  return { bodies: next, impacts };
}

/// Nothing is moving, so the page can stop asking for frames.
export function settled(bodies: readonly Body[]): boolean {
  return bodies.every((b) => b.asleep && !b.held);
}

/// A chip thrown up into the chat bar is sent. One falling past it, or one
/// that only bounced up off the pile, is not.
export function reachesTarget(body: Body, target: Rect): boolean {
  if (!body.thrown || body.vy >= 0) return false;
  return body.x < target.x + target.w && body.x + body.w > target.x && body.y < target.y + target.h && body.y + body.h > target.y;
}

/// Floating speeds, in pixels a second: slow enough to read every chip.
export const DRIFT_MIN = 14;
export const DRIFT_MAX = 32;
/// Share of a thrown chip's extra speed kept after one second of floating.
const CALM_PER_SECOND = 0.15;

/// Lifts the landed pile into a float: each chip drifts off at a gentle speed
/// in its own direction, spread by the golden angle so no two leave together.
export function startDrift(bodies: readonly Body[]): Body[] {
  return bodies.map((b, i) => {
    const angle = (i * 2.399963) % (2 * Math.PI);
    const speed = DRIFT_MIN + (((i * 7) % 10) / 9) * (DRIFT_MAX - DRIFT_MIN);
    return { ...b, asleep: false, restFrames: 0, thrown: false, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  });
}

/// Keeps a floating chip between the drift speeds. A thrown one slows down to
/// them first, so a throw still carries it to the chat bar.
function calm(b: Body, dt: number) {
  const speed = Math.hypot(b.vx, b.vy);
  if (b.thrown && speed > DRIFT_MAX) {
    const keep = Math.max(DRIFT_MAX / speed, CALM_PER_SECOND ** dt);
    b.vx *= keep;
    b.vy *= keep;
    if (speed * keep <= DRIFT_MAX + 0.01) b.thrown = false;
    return;
  }
  b.thrown = false;
  if (speed === 0) { b.vx = DRIFT_MIN; return; }
  const target = Math.min(DRIFT_MAX, Math.max(DRIFT_MIN, speed));
  b.vx *= target / speed;
  b.vy *= target / speed;
}

/// One frame of the float: no gravity, walls and chips bounce gently, and
/// nothing ever rests. `top` keeps floating chips under the chat bar; a
/// thrown chip may still rise into it.
export function drift(bodies: readonly Body[], bounds: { top: number; width: number; height: number }, dt: number): Body[] {
  const next = bodies.map((b) => ({ ...b, asleep: false, restFrames: 0 }));
  for (const b of next) {
    if (b.held) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i];
      const c = next[j];
      if (a.held && c.held) continue;
      const overlapX = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
      const overlapY = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const alongX = overlapX < overlapY;
      const [first, second] = alongX ? (a.x < c.x ? [a, c] : [c, a]) : (a.y < c.y ? [a, c] : [c, a]);
      const overlap = alongX ? overlapX : overlapY;
      const key = alongX ? 'x' : 'y';
      const v = alongX ? 'vx' : 'vy';
      if (first.held) second[key] += overlap;
      else if (second.held) first[key] -= overlap;
      else { first[key] -= overlap / 2; second[key] += overlap / 2; }
      // Equal chips meeting head on trade speeds along the line they met on.
      if (first[v] > second[v]) {
        if (first.held) second[v] = Math.abs(second[v]);
        else if (second.held) first[v] = -Math.abs(first[v]);
        else [first[v], second[v]] = [second[v], first[v]];
      }
    }
  }
  for (const b of next) {
    if (b.held) continue;
    const top = b.thrown ? 0 : bounds.top;
    if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
    if (b.x + b.w > bounds.width) { b.x = bounds.width - b.w; b.vx = -Math.abs(b.vx); }
    if (b.y < top) { b.y = top; b.vy = Math.abs(b.vy); }
    if (b.y + b.h > bounds.height) { b.y = bounds.height - b.h; b.vy = -Math.abs(b.vy); }
    calm(b, dt);
  }
  return next;
}

/// Wakes a resting chip, for a throw or when the panel is resized.
export function wake(body: Body): Body {
  return { ...body, asleep: false, restFrames: 0 };
}
