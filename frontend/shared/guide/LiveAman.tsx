'use client';

import { useRef } from 'react';
import type { AmanMood } from '@/features/guide/amanDots';
import { AmanFace, type AmanSize } from './AmanFace';
import { useAmanLife, type AmanLifeOptions } from './useAmanLife';

/// An Aman face that blinks, looks and breathes (view 57, 15 Nov evening).
export function LiveAman({ size, mood, label = null, look, seed }: { size: AmanSize; mood: AmanMood; label?: string | null } & AmanLifeOptions) {
  const ref = useRef<HTMLSpanElement>(null);
  const { blink, gaze } = useAmanLife(ref, { look, seed: seed ?? `${mood}-${size}` });
  return (
    <span ref={ref} data-aman-live className="inline-grid shrink-0">
      <AmanFace size={size} mood={mood} gaze={gaze} blink={blink} label={label} />
    </span>
  );
}
