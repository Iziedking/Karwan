/// How many words of a checked answer show at each tick, so the whole answer
/// is out within `maxMs` whatever its length (view 84).
export function revealSteps(text: string, maxMs = 600, tickMs = 40): number[] {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (words === 0) return [];
  const ticks = Math.max(1, Math.min(words, Math.floor(maxMs / tickMs)));
  return Array.from({ length: ticks }, (_, i) => Math.ceil(((i + 1) * words) / ticks));
}
