/// Home Updates move on by themselves (view 39): every few seconds the strip
/// pages forward, and from the last page it goes back to the first. Nothing
/// moves while the pointer or focus is on it, when the person asked for
/// reduced motion, or when everything already fits.
export const UPDATES_EVERY_MS = 6_000;

export function nextUpdateMove(edges: { start: boolean; end: boolean }): 'next' | 'restart' | null {
  if (edges.start && edges.end) return null;
  return edges.end ? 'restart' : 'next';
}

export function updatesMayMove(state: { paused: boolean; reducedMotion: boolean; hidden: boolean }): boolean {
  return !state.paused && !state.reducedMotion && !state.hidden;
}
