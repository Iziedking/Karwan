/// FitLine's resize rule (shared/components/FitLine.tsx).

/// A page scrollbar coming or going moves the column by about this much.
const SCROLLBAR_SLACK = 24;

/// Whether a column that is now `width` wide needs fitting again. A change in
/// height alone never does, and neither does a small widening: a resize can
/// shorten the page, drop its scrollbar and widen the column, and refitting
/// then would bring the scrollbar back, so the two would trade places every
/// frame. Narrowing always refits, so the text is never cut short.
export function needsRefit(fittedWidth: number, width: number): boolean {
  const grew = width - fittedWidth;
  return grew < 0 || grew > SCROLLBAR_SLACK;
}
