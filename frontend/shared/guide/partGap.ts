/// A line Aman says opens a gap in the page instead of covering it (view 57,
/// 19 Nov): under a part, the part's bottom margin grows by the line's height;
/// at the top of the page, the content's top padding does. What follows moves
/// down and nothing is covered. The returned function puts back exactly what
/// was there.

export type GapSide = 'marginBlockEnd' | 'paddingBlockStart';
type Styled = { style: Partial<Record<GapSide, string>> };
type Computed = (el: Styled) => Partial<Record<GapSide, string>>;

const browserComputed: Computed = (el) => getComputedStyle(el as unknown as Element);

export function widenGap(el: Styled, px: number, computed: Computed = browserComputed, side: GapSide = 'marginBlockEnd'): () => void {
  const before = el.style[side] ?? '';
  const base = parseFloat(computed(el)[side] ?? '') || 0;
  el.style[side] = `${base + px}px`;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    el.style[side] = before;
  };
}
