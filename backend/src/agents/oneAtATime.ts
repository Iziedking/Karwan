/// One run per key at a time. A second run asked for while one is going is
/// turned away with 'busy': the run already going will offer or pass.
export function oneAtATime() {
  const busy = new Set<string>();
  return {
    async run<T>(key: string, work: () => Promise<T>): Promise<T | 'busy'> {
      const k = key.toLowerCase();
      if (busy.has(k)) return 'busy';
      busy.add(k);
      try {
        return await work();
      } finally {
        busy.delete(k);
      }
    },
  };
}

/// Runs of one key never overlap. Asks that arrive while a run is going fold
/// into one more run after it, so the last change is always judged and nothing
/// is judged twice at once. Different keys run side by side.
export function queuedPerKey(work: (key: string) => Promise<void>): (key: string) => Promise<void> {
  const running = new Map<string, Promise<void>>();
  const again = new Map<string, Promise<void>>();
  return function ask(key: string): Promise<void> {
    const k = key.toLowerCase();
    const queued = again.get(k);
    if (queued) return queued;
    const current = running.get(k);
    if (current) {
      const next = current
        .catch(() => undefined)
        .then(() => {
          again.delete(k);
          return start(k, key);
        });
      again.set(k, next);
      return next;
    }
    return start(k, key);
  };

  function start(k: string, key: string): Promise<void> {
    const run = work(key).finally(() => {
      if (running.get(k) === run) running.delete(k);
    });
    running.set(k, run);
    return run;
  }
}
