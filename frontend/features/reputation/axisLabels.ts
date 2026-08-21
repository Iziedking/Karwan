/// Which points on an axis get a label.
///
/// Picking every nth point is not enough on its own. With a 79-day series and a
/// target of four labels the step lands on index 76, the last index is 78, and
/// the two labels are drawn about six pixels apart: "08-04" and "08-18" printed
/// over each other and read as "0808-2418". A cadence says how often to label,
/// it does not say whether there is room.
///
/// So the cadence proposes and the geometry decides. Candidates are walked in
/// order and kept only when they clear the previous kept label by `minGap`
/// pixels. The last point is never dropped: it is the one the reader is looking
/// for, so when it collides with the label before it, that earlier one goes
/// instead.
export function pickAxisLabelIndices(
  positions: readonly number[],
  options: { target?: number; minGap?: number } = {},
): number[] {
  const count = positions.length;
  if (count === 0) return [];
  if (count === 1) return [0];

  const target = Math.max(2, options.target ?? 5);
  const minGap = Math.max(1, options.minGap ?? 46);
  const step = Math.max(1, Math.floor((count - 1) / (target - 1)));

  const candidates: number[] = [];
  for (let index = 0; index < count; index += step) candidates.push(index);
  const last = count - 1;
  if (candidates[candidates.length - 1] !== last) candidates.push(last);

  const kept: number[] = [];
  for (const index of candidates) {
    const previous = kept[kept.length - 1];
    if (previous === undefined) {
      kept.push(index);
      continue;
    }
    if (positions[index]! - positions[previous]! >= minGap) {
      kept.push(index);
      continue;
    }
    // Too close. The final point wins its collision, everything else loses it.
    if (index === last) {
      kept[kept.length - 1] = index;
      // Removing that label can leave the one before it clear of the end, but
      // never closer, so no further pass is needed.
      if (kept.length > 1 && positions[index]! - positions[kept[kept.length - 2]!]! < minGap) {
        kept.splice(kept.length - 2, 1);
      }
    }
  }
  return kept;
}
