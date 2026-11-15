'use client';

import { memo } from 'react';
import { AMAN_COLOURS, HALO, INK_STROKE, PATCH, amanDots, type AmanMood, type Feature } from '@/features/guide/amanDots';

export type AmanSize = 28 | 30 | 56 | 96;

interface Props {
  size: AmanSize;
  mood: AmanMood;
  gaze?: { x: number; y: number };
  blink?: boolean;
  /// The name read by a screen reader; null when a button around it already says it.
  label?: string | null;
}

const BLINK = 0.12;

function FeatureMark({ f, blink }: { f: Feature; blink: boolean }) {
  const { dot, ink, glint } = AMAN_COLOURS;
  switch (f.kind) {
    case 'eye': {
      const ry = blink ? f.ry * BLINK : f.ry;
      return (
        <g>
          <ellipse cx={f.cx} cy={f.cy} rx={f.rx + PATCH} ry={f.ry + PATCH} fill={dot} />
          <ellipse cx={f.cx} cy={f.cy} rx={f.rx} ry={ry} fill={ink} />
          {!blink && <circle cx={f.glint.cx} cy={f.glint.cy} r={f.glint.r} fill={glint} />}
        </g>
      );
    }
    case 'mouth':
      return (
        <g>
          <ellipse cx={f.cx} cy={f.cy} rx={f.rx + PATCH} ry={f.ry + PATCH} fill={dot} />
          <ellipse cx={f.cx} cy={f.cy} rx={f.rx} ry={f.ry} fill={ink} />
        </g>
      );
    case 'bar':
      return (
        <g>
          <rect x={f.x - PATCH} y={f.y - PATCH} width={f.w + PATCH * 2} height={f.h + PATCH * 2} rx={f.h / 2 + PATCH} fill={dot} />
          <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.h / 2} fill={ink} />
        </g>
      );
    case 'arc':
      return (
        <g fill="none" strokeLinecap="round">
          <path d={f.d} stroke={dot} strokeWidth={HALO} />
          <path d={f.d} stroke={ink} strokeWidth={INK_STROKE} />
        </g>
      );
  }
}

/// Aman's face (view 57): fixed colours, the same on dark and light. The parent
/// owns blink and gaze, so this draws one frame and keeps no state.
export const AmanFace = memo(function AmanFace({ size, mood, gaze, blink = false, label = 'Aman' }: Props) {
  const { dots, features } = amanDots(mood, gaze);
  const named = label !== null;
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role={named ? 'img' : undefined}
      aria-label={named ? label : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
      data-aman-mood={mood}
      className="shrink-0"
    >
      {dots.map((d) => (
        <circle key={`${d.cx}-${d.cy}`} cx={d.cx} cy={d.cy} r={d.r} fill={d.rim ? AMAN_COLOURS.rim : AMAN_COLOURS.dot} />
      ))}
      {features.map((f, i) => <FeatureMark key={i} f={f} blink={blink} />)}
    </svg>
  );
});
