export const TOUR_LAUNCHER_VISIBLE_MS = 12_000;
export const TOUR_LAUNCHER_VERSION = 1;

export function tourLauncherStorageKey(tourId: string): string {
  return `karwan:tour-launcher:v${TOUR_LAUNCHER_VERSION}:${tourId}`;
}
