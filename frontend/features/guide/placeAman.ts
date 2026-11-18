/// Where Aman sits (view 57): docked at the inline end above the bottom bar,
/// or just under the part of the page the move is about, with its line beside
/// it toward the inline start.

export interface Rect { left: number; top: number; width: number; height: number }

export interface PlaceInput {
  viewport: { width: number; height: number };
  anchor: Rect | null;
  bottomBar: number;
  rtl: boolean;
  lineSize: { width: number; height: number } | null;
}

export interface Placement {
  face: { x: number; y: number };
  line: { x: number; y: number; maxWidth: number; maxHeight: number } | null;
}

export const FACE = 56;
export const GAP = 12;
const LAPTOP = 1024;

export const edgeFor = (width: number) => (width >= LAPTOP ? 24 : 16);
export const lineMax = (width: number) => width - 32 - FACE - GAP;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function onScreen(a: Rect, height: number, floor: number): boolean {
  return a.width > 0 && a.height > 0 && a.top < floor && a.top + a.height > 0 && a.top < height;
}

export function placeAman({ viewport, anchor, bottomBar, rtl, lineSize }: PlaceInput): Placement {
  const { width, height } = viewport;
  const edge = edgeFor(width);
  const floor = height - bottomBar - edge;
  const x = rtl ? edge : width - edge - FACE;
  let y = floor - FACE;

  if (anchor && onScreen(anchor, height, floor)) {
    const below = anchor.top + anchor.height + GAP;
    const above = anchor.top - GAP - FACE;
    if (below + FACE <= floor) y = below;
    else if (above >= edge) y = above;
  }
  y = clamp(y, edge, Math.max(edge, floor - FACE));

  if (!lineSize) return { face: { x, y }, line: null };

  const maxWidth = Math.max(0, Math.min(lineMax(width), lineSize.width));
  const lineX = rtl ? x + FACE + GAP : x - GAP - maxWidth;
  // The line never runs past the floor: on a short screen it takes the room
  // there is and scrolls inside, so its button is never cut off.
  const maxHeight = Math.max(FACE, floor - edge);
  const shown = Math.min(Math.max(lineSize.height, FACE), maxHeight);
  const lineY = clamp(y + FACE - shown, edge, floor - shown);
  return { face: { x, y }, line: { x: lineX, y: lineY, maxWidth, maxHeight } };
}
