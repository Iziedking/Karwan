import { config } from '../config.js';
import type { Point } from './rules.js';

/// Turns what a person typed about where they are ("Wuse 2, Abuja") into a
/// point, used only to work out distance (view 72). OpenStreetMap's public
/// geocoder, within its usage policy (operations.osmfoundation.org/policies/
/// nominatim): one call a second across Karwan, Karwan's name and contact on
/// every call, and the same place is never asked twice. Only the typed text
/// and the country leave Karwan. Any failure is null: matching then uses
/// place names alone.

export interface GeoAdapter {
  place(text: string, country: string | null): Promise<(Point & { precision: 'area' | 'city' }) | null>;
}

type Hit = { lat?: string; lon?: string; category?: string; type?: string };

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const CACHE_MAX = 5_000;

export function nominatimAdapter(opts: { fetcher?: typeof fetch; contact: string; minGapMs?: number; timeoutMs?: number }): GeoAdapter {
  const fetcher = opts.fetcher ?? fetch;
  const minGapMs = opts.minGapMs ?? 1_100;
  const timeoutMs = opts.timeoutMs ?? 4_000;
  const cache = new Map<string, (Point & { precision: 'area' | 'city' }) | null>();
  let turn: Promise<void> = Promise.resolve();
  let lastAt = 0;

  // One call at a time, at least minGapMs apart.
  const inTurn = <T>(run: () => Promise<T>): Promise<T> => {
    const mine = turn.then(async () => {
      const wait = lastAt + minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await run();
      } finally {
        lastAt = Date.now();
      }
    });
    turn = mine.then(() => undefined, () => undefined);
    return mine;
  };

  const ask = (q: string, country: string | null, placesOnly: boolean) =>
    inTurn(async (): Promise<Hit[]> => {
      const params = new URLSearchParams({ format: 'jsonv2', limit: '1', q });
      if (country) params.set('countrycodes', country.toLowerCase());
      if (placesOnly) {
        params.set('layer', 'address');
        params.set('featureType', 'settlement');
      }
      // A timer of our own: it is cleared as soon as the call ends.
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), timeoutMs);
      try {
        const response = await fetcher(`${ENDPOINT}?${params}`, {
          headers: { 'User-Agent': `Karwan/1.0 (${opts.contact})`, 'Accept-Language': 'en' },
          signal: stop.signal,
        });
        if (!response.ok) throw new Error(`geocoder ${response.status}`);
        return (await response.json()) as Hit[];
      } finally {
        clearTimeout(timer);
      }
    });

  const read = (h: Hit | undefined) => {
    const lat = Number(h?.lat);
    const lng = Number(h?.lon);
    if (!h || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, precision: h.category === 'place' && h.type === 'city' ? ('city' as const) : ('area' as const) };
  };

  return {
    async place(text, country) {
      const q = text.trim().replace(/\s+/g, ' ').slice(0, 200);
      if (!q) return null;
      const key = `${(country ?? '').toUpperCase()}|${q.toLowerCase()}`;
      if (cache.has(key)) return cache.get(key) ?? null;
      let found: ReturnType<typeof read> = null;
      try {
        // A place or an area first; a name the map doesn't know as an area
        // (Wuse 2, Lekki Phase 1) then lands on something inside it.
        found = read((await ask(q, country, true))[0]) ?? read((await ask(q, country, false))[0]);
      } catch {
        return null;
      }
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, found);
      return found;
    },
  };
}

let live: GeoAdapter | null | undefined;

/// The adapter Karwan uses, or null when switched off (`GEO_ENABLED`).
export function geoAdapter(): GeoAdapter | null {
  if (live === undefined) live = config.GEO_ENABLED ? nominatimAdapter({ contact: config.GEO_CONTACT }) : null;
  return live;
}
