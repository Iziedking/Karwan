/// "Use my location" (view 39, 19 Nov). The phone gives its position only when
/// the person taps and allows it; Karwan's own server names the nearest town
/// from Karwan's own list. No map service is asked.

export const LOCATE_OPTIONS = { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 } as const;

export interface FoundPlace {
  country: string;
  city: string;
  admin: string;
  point: { lat: number; lng: number };
}

export type Position = { coords: { latitude: number; longitude: number } };

export async function findMe(deps: {
  locate: (() => Promise<Position>) | null;
  near: (p: { lat: number; lng: number }) => Promise<{ country: string; city: string; admin: string } | { country: null }>;
}): Promise<FoundPlace | null> {
  if (!deps.locate) return null;
  try {
    const { coords } = await deps.locate();
    const point = { lat: coords.latitude, lng: coords.longitude };
    const town = await deps.near(point);
    return town.country === null ? null : { ...town, point };
  } catch {
    return null;
  }
}
