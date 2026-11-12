/// What a person presses to act or types into. Plain links are left out on
/// purpose: lists and cards are links from edge to edge, and counting them
/// would keep the note away from most pages.
export const CONTROL =
  'button,input,select,textarea,summary,[role="button"],[role="tab"],[role="radio"],[role="switch"],[role="checkbox"]';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Hit {
  closest(selector: string): unknown;
}

const COLS = 9;
const ROWS = 4;

/// Whether the note, placed at this box, would sit on top of a control that is
/// not its own (view 57: the guide never covers a button). The box is probed
/// on a grid fine enough that a control 44 px wide cannot slip between points.
export function coversControl<T extends Hit>(box: Box, elementsAt: (x: number, y: number) => readonly T[], isOwn: (el: T) => boolean): boolean {
  if (!(box.width > 0) || !(box.height > 0)) return false;
  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const x = box.left + (box.width * (c + 0.5)) / COLS;
      const y = box.top + (box.height * (r + 0.5)) / ROWS;
      for (const el of elementsAt(x, y)) {
        if (isOwn(el)) continue;
        if (el.closest(CONTROL)) return true;
      }
    }
  }
  return false;
}
