export interface GuideRect { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface GuideViewport { width: number; height: number }

const EDGE = 16;
const GAP = 24;

/** Keep the explanation beside its subject when it fits. Mobile uses a sheet. */
export function guidePlacement(target: GuideRect | null, viewport: GuideViewport, panel: GuideViewport, rtl = false) {
  const width = Math.min(panel.width, viewport.width - EDGE * 2);
  const height = Math.min(panel.height, viewport.height - EDGE * 2);
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, viewport.width - width - EDGE));
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, viewport.height - height - EDGE));
  const centered = { left: clampX((viewport.width - width) / 2), top: clampY((viewport.height - height) / 2), width };
  if (!target) return centered;
  if (viewport.width < 768) return { ...centered, top: clampY(viewport.height - height - EDGE) };

  const right = { left: target.right + GAP, top: clampY(target.top) };
  const left = { left: target.left - GAP - width, top: clampY(target.top) };
  const candidates = rtl ? [left, right] : [right, left];
  candidates.push(
    { left: clampX(target.left + (target.width - width) / 2), top: target.bottom + GAP },
    { left: clampX(target.left + (target.width - width) / 2), top: target.top - GAP - height },
  );
  const fits = candidates.find(p => p.left >= EDGE && p.top >= EDGE && p.left + width <= viewport.width - EDGE && p.top + height <= viewport.height - EDGE);
  return fits ? { ...fits, width } : { ...centered, top: clampY(viewport.height - height - EDGE) };
}

export const GUIDE_WAIT_MS = 2000;
export function guideSecondsLeft(readyAt: number, now: number): number {
  return Math.max(0, Math.ceil((readyAt - now) / 1000));
}
