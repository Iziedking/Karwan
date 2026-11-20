/// One counter answered at a time for each offer. A counter that arrives while
/// the seller's agent is still finishing its last reply waits and is answered
/// next; if several arrive, only the newest stands, as on the board.
export function counterTurns<T>() {
  const waiting = new Map<string, T>();
  const take = (key: string) => {
    const next = waiting.get(key);
    waiting.delete(key);
    return next;
  };
  return {
    async turn(key: string, counter: T, busy: () => boolean, answer: (counter: T) => Promise<void>): Promise<void> {
      if (busy()) {
        waiting.set(key, counter);
        return;
      }
      let failure: unknown = null;
      for (let next: T | undefined = counter; next !== undefined; next = take(key)) {
        try {
          await answer(next);
        } catch (err) {
          failure ??= err;
        }
      }
      if (failure) throw failure;
    },
  };
}
