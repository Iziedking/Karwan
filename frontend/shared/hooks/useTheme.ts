'use client';
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/// Must stay in lockstep with THEME_PREPAINT_SCRIPT (themePrepaintScript.ts),
/// which runs the same read before first paint. If the two ever disagree the page
/// paints one theme and then swaps, which is the flash that script exists to
/// prevent.
const STORAGE_KEY = 'karwan-theme';

/// Fires when the theme changes, so every mounted reader updates together.
const CHANGE_EVENT = 'karwan-theme-change';

/// Dark unless light was chosen. A theme saved as 'system' (the old Daylight
/// option) and anything unrecognised read as dark.
export function themeFromStored(stored: string | null | undefined): Theme {
  return stored === 'light' ? 'light' : 'dark';
}

/// The landing page is always dark. It has no theme control and ignores a
/// preference set anywhere else; the stored preference applies again on every
/// other route.
export function isAlwaysDarkRoute(pathname: string | null | undefined): boolean {
  return pathname === '/';
}

/// What a route paints for a saved theme. Every paint goes through here.
export function themeForRoute(pathname: string | null | undefined, saved: Theme): Theme {
  return isAlwaysDarkRoute(pathname) ? 'dark' : saved;
}

function currentPathname(): string | null {
  return typeof window === 'undefined' ? null : window.location.pathname;
}

export function readPreference(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return themeFromStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private browsing and blocked storage both throw here.
    return 'dark';
  }
}

/// How long the crossfade between themes runs. Must match the duration in the
/// `.theme-shifting` rule in globals.css.
const SHIFT_MS = 380;
let shiftTimer = 0;

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  // Nothing to do, and nothing to animate. This is also what keeps first paint
  // silent: the pre-paint script has already set the right attribute, so the
  // hook's mount call agrees with it and no crossfade fires.
  if (current === theme) return;

  root.classList.add('theme-shifting');
  window.clearTimeout(shiftTimer);
  shiftTimer = window.setTimeout(() => root.classList.remove('theme-shifting'), SHIFT_MS + 40);

  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

/// The single write path: the document attribute, localStorage and every
/// mounted reader are updated together.
export function setThemePreference(theme: Theme): Theme {
  const painted = themeForRoute(currentPathname(), theme);
  applyTheme(painted);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this session; only persistence is lost.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<Theme>(CHANGE_EVENT, { detail: painted }));
  }
  return painted;
}

/// Adopt the account's saved theme on a device that has never been given one.
/// Never overwrites a choice already made on this device.
export function adoptPreferenceIfUnset(saved: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch {
    return;
  }
  setThemePreference(themeFromStored(saved));
}

/// Read-only view of the saved and painted theme, kept live across readers.
/// Writes go through `setThemePreference`, not through here.
///
/// `mounted` is false through the server render and the first client render.
/// Callers use it to hold a same-size placeholder: the stored theme is not
/// readable during SSR, so rendering the real value immediately would ship
/// markup for the wrong theme and hydrate into a mismatch.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [preference, setPreferenceState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = readPreference();
    const painted = themeForRoute(currentPathname(), saved);
    setPreferenceState(saved);
    setThemeState(painted);
    applyTheme(painted);
    setMounted(true);

    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === 'light' || next === 'dark') setThemeState(next);
      setPreferenceState(readPreference());
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return { theme, preference, mounted };
}
