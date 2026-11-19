import { pointLines } from '@/shared/i18n/messages/pointLines';
import type { Rect } from './placeAman';

/// Which part Aman explains, and where its line goes (view 57, 19 Nov). A part
/// is any `data-guide` mark with a line in pointLines, the same set Show me uses.

export interface PartBox { id: string; rect: Rect; order: number; hidden: boolean }

export const DWELL_MS = 2000;
export const LINES_PER_VISIT = 2;
export const HEARD_AFTER_MS = 1500;
export const BETWEEN_LINES_MS = 4000;
export const LINE_WIDTH = 280;
export const LAPTOP_MIN = 1024;
const SIDE_GAP = 16;

const ORDER = new Map(Object.keys(pointLines.en).map((id, i) => [id, i]));
export const partOrder = (id: string): number => ORDER.get(id) ?? Infinity;

const area = (r: Rect) => r.width * r.height;

export function pickPart(a: { parts: PartBox[]; heard: ReadonlySet<string>; viewport: { width: number; height: number } }): string | null {
  const open = a.parts.filter((p) => !p.hidden && !a.heard.has(p.id) && p.rect.width > 0 && p.rect.height > 0);
  const mid = a.viewport.height / 2;
  const onMiddle = open.filter((p) => p.rect.top <= mid && p.rect.top + p.rect.height >= mid);
  if (onMiddle.length) return onMiddle.reduce((x, y) => (area(y.rect) < area(x.rect) ? y : x)).id;
  const inView = open.filter((p) => p.rect.top >= 0 && p.rect.top + p.rect.height <= a.viewport.height);
  if (!inView.length) return null;
  return inView.reduce((x, y) => (y.order < x.order ? y : x)).id;
}

export type LineMode = { mode: 'inline' } | { mode: 'beside'; side: 'end' | 'start' };

export function lineMode(a: { viewportWidth: number; partRect: Rect; rtl: boolean; lineWidth?: number }): LineMode {
  if (a.viewportWidth < LAPTOP_MIN) return { mode: 'inline' };
  const need = (a.lineWidth ?? LINE_WIDTH) + SIDE_GAP;
  const left = a.partRect.left;
  const right = a.viewportWidth - (a.partRect.left + a.partRect.width);
  const [end, start] = a.rtl ? [left, right] : [right, left];
  if (end >= need) return { mode: 'beside', side: 'end' };
  if (start >= need) return { mode: 'beside', side: 'start' };
  return { mode: 'inline' };
}
