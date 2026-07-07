/// Shared "is the brand splash showing" flag. The GlobalLoadingSplash owns it;
/// other root-level overlays (the first-signin Terms gate) read it so they don't
/// pop over the loader before the page has painted. A plain external store read
/// with useSyncExternalStore so any subscriber re-renders when it flips.

let splashActive = true; // assume covering until the splash reports otherwise
const listeners = new Set<() => void>();

export function setSplashActive(active: boolean): void {
  if (splashActive === active) return;
  splashActive = active;
  for (const l of listeners) l();
}

export function subscribeSplash(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSplashActive(): boolean {
  return splashActive;
}

/// Server snapshot: the splash never covers on the server, so overlays that gate
/// on it must not stay suppressed through hydration on non-splash routes.
export function getSplashActiveServer(): boolean {
  return false;
}
