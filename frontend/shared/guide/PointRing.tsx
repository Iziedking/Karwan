'use client';

import type { Rect } from '@/features/guide/placeAman';

const PAD = 6;

/// The ring around a part Aman lights (Figma 355:4454): 3 px in the action
/// colour, 6 px out from the part, following its corners. It never takes a tap.
export function PointRing({ rect, radius }: { rect: Rect; radius: number }) {
  return (
    <div
      aria-hidden
      data-point-ring=""
      style={{
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        borderRadius: radius + PAD,
      }}
      className="pointer-events-none fixed z-40 border-[3px] border-[var(--action)]"
    />
  );
}
