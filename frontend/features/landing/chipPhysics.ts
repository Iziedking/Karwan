/// Small physics for the chips on the landing (section 5, view 49): gravity,
/// a floor and walls that bounce, chips that pile on each other, and rest.
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

export function step(bodies: readonly Body[], world: World, dt: number): { bodies: Body[]; impacts: number[] } {
  const next = bodies.map((b) => ({ ...b }));
  const impacts: number[] = [];
  const supported = new Array(next.length).fill(false);

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
          const push = overlapX / 2 + 0.01;
          const [left, right] = a.x < c.x ? [a, c] : [c, a];
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

/// Wakes a resting chip, for a throw or when the panel is resized.
export function wake(body: Body): Body {
  return { ...body, asleep: false, restFrames: 0 };
}
