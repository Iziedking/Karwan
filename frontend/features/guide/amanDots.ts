/// Aman's face (view 57): a disc of dots on a 9 by 9 grid with the mood's eyes
/// and mouth laid over it, in a 96 box. The Figma component (314:627) is drawn
/// from these numbers; change them here and redraw it.

export type AmanMood = 'idle' | 'talking' | 'thinking' | 'pleased' | 'waiting';

export interface Dot { cx: number; cy: number; r: number; rim: boolean }

export type Feature =
  | { kind: 'eye'; cx: number; cy: number; rx: number; ry: number; glint: { cx: number; cy: number; r: number } }
  | { kind: 'mouth'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'bar'; x: number; y: number; w: number; h: number }
  | { kind: 'arc'; d: string };

export const AMAN_COLOURS = { dot: '#AFC95B', rim: '#97B04B', ink: '#16202A', glint: '#F4F4F1' } as const;
export const PATCH = 0.5;
export const HALO = 5.5;
export const INK_STROKE = 4.2;

const CENTRE = 48;
const PITCH = 10.7;
const DOT_R = 2.2;
const DISC = 4.25;
const RIM = 3.6;
const CLEAR = 1.2;
const GAZE = 3;

const eye = (cx: number, cy: number, rx: number, ry: number): Feature =>
  ({ kind: 'eye', cx, cy, rx, ry, glint: { cx: cx - 2.4, cy: cy - 3, r: 2.2 } });

const FEATURES: Record<AmanMood, Feature[]> = {
  idle: [eye(41, 42, 7.5, 8.5), eye(65, 42, 7.5, 8.5)],
  talking: [eye(36, 40, 7.5, 8.5), eye(60, 40, 7.5, 8.5), { kind: 'mouth', cx: 48, cy: 64, rx: 6.5, ry: 5.5 }],
  thinking: [eye(31, 36, 6.5, 7.5), eye(54, 36, 6.5, 7.5), { kind: 'bar', x: 42, y: 61, w: 14, h: 4.4 }],
  pleased: [
    { kind: 'arc', d: 'M28 46 C33.33 39.33 38.67 39.33 44 46' },
    { kind: 'arc', d: 'M52 46 C57.33 39.33 62.67 39.33 68 46' },
    { kind: 'arc', d: 'M37 60 C44.33 67.33 51.67 67.33 59 60' },
  ],
  waiting: [eye(36, 42, 8.5, 10), eye(60, 42, 8.5, 10)],
};

interface Box { x0: number; y0: number; x1: number; y1: number }

function boxOf(f: Feature): Box {
  switch (f.kind) {
    case 'eye':
    case 'mouth':
      return { x0: f.cx - f.rx - PATCH, y0: f.cy - f.ry - PATCH, x1: f.cx + f.rx + PATCH, y1: f.cy + f.ry + PATCH };
    case 'bar':
      return { x0: f.x - PATCH, y0: f.y - PATCH, x1: f.x + f.w + PATCH, y1: f.y + f.h + PATCH };
    case 'arc': {
      const n = (f.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const xs = n.filter((_, i) => i % 2 === 0);
      const ys = n.filter((_, i) => i % 2 === 1);
      const g = HALO / 2;
      return { x0: Math.min(...xs) - g, y0: Math.min(...ys) - g, x1: Math.max(...xs) + g, y1: Math.max(...ys) + g };
    }
  }
}

function clears(d: Dot, b: Box): boolean {
  const dx = Math.max(b.x0 - d.cx, 0, d.cx - b.x1);
  const dy = Math.max(b.y0 - d.cy, 0, d.cy - b.y1);
  return Math.hypot(dx, dy) - d.r >= CLEAR;
}

const round = (n: number) => Math.round(n * 100) / 100;

/// Every cell of the disc, before any feature takes its dots away.
export function discCells(): Dot[] {
  const cells: Dot[] = [];
  for (let j = -4; j <= 4; j += 1) {
    for (let i = -4; i <= 4; i += 1) {
      const d = Math.hypot(i, j);
      if (d <= DISC) cells.push({ cx: round(CENTRE + i * PITCH), cy: round(CENTRE + j * PITCH), r: DOT_R, rim: d > RIM });
    }
  }
  return cells;
}

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

function look(f: Feature, dx: number, dy: number): Feature {
  if (f.kind !== 'eye' || (dx === 0 && dy === 0)) return f;
  return { ...f, cx: f.cx + dx, cy: f.cy + dy, glint: { ...f.glint, cx: f.glint.cx + dx, cy: f.glint.cy + dy } };
}

/// The dots are worked out from the eyes at rest, so the grid holds still while the eyes look around.
export function amanDots(mood: AmanMood, gaze?: { x: number; y: number }): { dots: Dot[]; features: Feature[] } {
  const rest = FEATURES[mood];
  const boxes = rest.map(boxOf);
  const dots = discCells().filter((d) => boxes.every((b) => clears(d, b)));
  const dx = gaze ? clamp(gaze.x) * GAZE : 0;
  const dy = gaze ? clamp(gaze.y) * GAZE : 0;
  return { dots, features: rest.map((f) => look(f, dx, dy)) };
}
