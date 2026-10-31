export interface Run<T> {
  item: T;
  repeat: number;
}

/// Folds neighbouring rows that read the same into one row with a count, so
/// six sellers skipping in a row reads as one line ×6. Only neighbours fold,
/// so the list keeps its time order.
export function eventRuns<T>(items: readonly T[], sameRow: (a: T, b: T) => boolean): Run<T>[] {
  const runs: Run<T>[] = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && sameRow(last.item, item)) last.repeat += 1;
    else runs.push({ item, repeat: 1 });
  }
  return runs;
}
