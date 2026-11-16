import { blinkDelay } from './amanMotion';
import type { MotionLevel } from '@/shared/motion/level';

/// What keeps every Aman face alive (view 57, 15 Nov evening): a blink, eyes
/// that look, and a slow breath. All of it is still when motion is not wanted.

export const BLINK_MS = 120;
/// The gap before the second blink of a double.
export const DOUBLE_GAP_MS = 240;
export const BREATH_MS = 4000;
/// Past this distance the eyes rest centred.
export const GAZE_REACH_PX = 400;
const GAZE_FULL_PX = 160;

/// The n-th blink: how long to wait before it, and whether it is a double.
export function blinkPlan(seed: number, n: number): { delay: number; double: boolean } {
  return { delay: blinkDelay(seed, n), double: n % 4 === 3 };
}

/// 0 at rest, 1 at the top of the breath.
export function breathOffset(t: number): number {
  return (1 - Math.cos((2 * Math.PI * t) / BREATH_MS)) / 2;
}

/// Where the eyes look, from -1 to 1 on each axis: fully toward a point 160 px
/// away or more, less when it is nearer, and centred past 400 px.
export function gazeToward(face: { x: number; y: number }, point: { x: number; y: number }): { x: number; y: number } {
  const dx = point.x - face.x;
  const dy = point.y - face.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > GAZE_REACH_PX) return { x: 0, y: 0 };
  const reach = Math.min(1, d / GAZE_FULL_PX);
  return { x: (dx / d) * reach, y: (dy / d) * reach };
}

export type Life = 'none' | 'blink' | 'full';

export function lifeAllowed(s: { reduced: boolean; level: MotionLevel; hidden: boolean }): Life {
  if (s.reduced || s.level === 'still' || s.hidden) return 'none';
  return s.level === 'lite' ? 'blink' : 'full';
}

/// Where Aman looks in a tour: straight at the part being explained, at any distance.
export function aimAt(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d === 0 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
}
