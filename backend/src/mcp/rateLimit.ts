/// A fixed-window limit per caller: at most `limit` calls in each `windowMs`.
export function windowLimiter(limit: number, windowMs: number, now: () => number = Date.now): (caller: string) => boolean {
  const seen = new Map<string, { start: number; count: number }>();
  return (caller) => {
    const t = now();
    const key = caller.toLowerCase();
    const w = seen.get(key);
    if (!w || t - w.start >= windowMs) {
      if (seen.size > 10_000) seen.clear();
      seen.set(key, { start: t, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  };
}
