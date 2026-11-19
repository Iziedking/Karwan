import type { Point } from './rules.js';

/// Karwan's own town list (GeoNames, CC BY 4.0; see places/CREDITS.md), used
/// to suggest towns as a person types and to find the town nearest a position
/// their phone shares (view 39, 19 Nov). Nothing here calls out of Karwan.

export interface Town {
  name: string;
  admin: string;
  /// ISO 3166-1 alpha-2, upper case.
  cc: string;
  lat: number;
  lng: number;
  pop: number;
}

export type TownRow = [name: string, admin: string, cc: string, lat: number, lng: number, pop: number];

/// Towns within this distance of a position count as where the person is.
export const NEAR_KM = 50;
export const SEARCH_MAX = 8;

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export function townsFrom(rows: readonly TownRow[]): Town[] {
  return rows.map(([name, admin, cc, lat, lng, pop]) => ({ name, admin, cc, lat, lng, pop }));
}

/// Towns in one country whose name starts with what was typed, biggest first,
/// then towns whose name has it inside. Nothing typed gives the biggest towns.
export function searchTowns(towns: readonly Town[], cc: string, q: string, max = SEARCH_MAX): Town[] {
  const country = cc.trim().toUpperCase();
  const typed = fold(q);
  const inCountry = towns.filter((t) => t.cc === country).sort((a, b) => b.pop - a.pop);
  if (!typed) return inCountry.slice(0, max);
  const starts: Town[] = [];
  const inside: Town[] = [];
  for (const t of inCountry) {
    const name = fold(t.name);
    if (name.startsWith(typed)) starts.push(t);
    else if (name.includes(typed)) inside.push(t);
  }
  return [...starts, ...inside].slice(0, max);
}

export function kmApart(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/// The town nearest a position, or null when none is within maxKm.
export function nearestTown(towns: readonly Town[], p: Point, maxKm = NEAR_KM): Town | null {
  let best: Town | null = null;
  let bestKm = Infinity;
  for (const t of towns) {
    // A cheap box first: one degree of latitude is about 111 km.
    if (Math.abs(t.lat - p.lat) > maxKm / 100) continue;
    const km = kmApart(p, t);
    if (km < bestKm) {
      best = t;
      bestKm = km;
    }
  }
  return best && bestKm <= maxKm ? best : null;
}

/// A position kept to about a kilometre.
export function roundPoint(p: Point): Point {
  const r = (v: number) => Math.round(v * 100) / 100 + 0;
  return { lat: r(p.lat), lng: r(p.lng) };
}

let loaded: Town[] | null = null;

/// The full list, read once when first needed.
export async function allTowns(): Promise<Town[]> {
  if (!loaded) {
    const { default: rows } = await import('./places/towns.json', { with: { type: 'json' } });
    loaded = townsFrom(rows as unknown as TownRow[]);
  }
  return loaded;
}
