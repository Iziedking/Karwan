/// The landing's motion maths (view 49). Scenes read a progress value from 0
/// to 1 and animate with transforms and opacity only; these functions decide
/// that value, which step of a route is lit, and which clip a screen loads.

const clamp01 = (n: number) => (n <= 0 ? 0 : n >= 1 ? 1 : n);

/// A sticky scene: 0 when its top reaches the top of the screen, 1 when its
/// bottom reaches the bottom of the screen.
export function pinnedProgress({ top, height, viewport }: { top: number; height: number; viewport: number }): number {
  const travel = height - viewport;
  if (travel <= 0) return top <= 0 ? 1 : 0;
  return clamp01(-top / travel);
}

/// A scene coming into view: 0 while its top is at the bottom of the screen,
/// 1 once its top has risen `span` of the way up.
export function enterProgress({ top, viewport, span = 0.6 }: { top: number; viewport: number; span?: number }): number {
  return clamp01((viewport - top) / (viewport * span));
}

/// Which step of a route is lit at a given progress, and how far into it.
export function stepAt(progress: number, steps: number): { index: number; within: number } {
  const p = clamp01(progress);
  if (p === 1) return { index: steps - 1, within: 1 };
  const scaled = p * steps;
  const index = Math.floor(scaled);
  return { index, within: scaled - index };
}

/// Delay for the nth item of a row that rises one after another.
export function stagger(index: number, gapMs = 80): number {
  return index * gapMs;
}

export type ClipChoice = 'poster' | 'small' | 'large';

/// Phones load the small clip. Reduced motion, Save-Data and 2G keep the poster.
export function clipChoice({
  reducedMotion,
  saveData,
  effectiveType,
  viewportWidth,
}: {
  reducedMotion: boolean;
  saveData: boolean;
  effectiveType: string | undefined;
  viewportWidth: number;
}): ClipChoice {
  if (reducedMotion || saveData) return 'poster';
  if (effectiveType === '2g' || effectiveType === 'slow-2g') return 'poster';
  return viewportWidth < 768 ? 'small' : 'large';
}

/// One requestAnimationFrame for the whole page. Scroll and resize wake it;
/// every scene measures and writes once in that frame, however many events
/// arrived. No frame is asked for while nobody is listening.
export function createFrameLoop(requestFrame: (cb: () => void) => unknown) {
  const subscribers = new Set<() => void>();
  let pending = false;
  const run = () => {
    pending = false;
    for (const fn of subscribers) fn();
  };
  return {
    add(fn: () => void) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    wake() {
      if (pending || subscribers.size === 0) return;
      pending = true;
      requestFrame(run);
    },
    size: () => subscribers.size,
  };
}
