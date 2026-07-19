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

/// Imperative "raise the splash now" request, fired SYNCHRONOUSLY at the sign-in
/// moment (emitAuthChanged) — before any useAuth instance's async refresh flips
/// its isAuthenticated. GlobalLoadingSplash and TermsModal hold separate useAuth
/// instances that flip at different times, so arming off isAuthenticated let the
/// gate's instance flip first and paint terms before the splash's instance armed.
/// Firing here, ahead of every instance, guarantees the splash covers first.
const requestListeners = new Set<() => void>();

export function requestSplash(): void {
  for (const l of requestListeners) l();
}

export function subscribeSplashRequest(listener: () => void): () => void {
  requestListeners.add(listener);
  return () => requestListeners.delete(listener);
}

/// Server snapshot: the splash never covers on the server, so overlays that gate
/// on it must not stay suppressed through hydration on non-splash routes.
export function getSplashActiveServer(): boolean {
  return false;
}
