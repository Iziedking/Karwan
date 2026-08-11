'use client';
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/// What the user asked for, which is not the same as what gets painted.
/// 'system' is a standing instruction to follow the OS, so it resolves freshly
/// every time rather than being frozen into a stored 'light' or 'dark'.
export type ThemePreference = Theme | 'system';

/// Must stay in lockstep with the pre-paint script in app/layout.tsx, which runs
/// the same read before first paint. If the two ever disagree the page paints one
/// theme and then swaps, which is the flash that script exists to prevent.
const STORAGE_KEY = 'karwan-theme';

/// Fires when any mounted control changes the theme, so a second switcher on the
/// page updates its own label instead of showing the theme the user just left.
const CHANGE_EVENT = 'karwan-theme-change';

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/// The stored preference, or 'system' when there is none. Anything unrecognised
/// also reads as 'system': a value we cannot interpret is not a reason to force
/// light on someone whose OS is dark.
export function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private browsing and blocked storage both throw here.
  }
  return 'system';
}

export function resolveTheme(pref: ThemePreference): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

export function readTheme(): Theme {
  return resolveTheme(readPreference());
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

/// The single write path. Every theme control goes through this so the three
/// things that have to agree — the document attribute, localStorage, and any
/// other mounted switcher — are updated together rather than by whoever
/// remembers to.
export function setThemePreference(pref: ThemePreference): Theme {
  const resolved = resolveTheme(pref);
  applyTheme(resolved);
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // The theme still applies for this session; only persistence is lost.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<Theme>(CHANGE_EVENT, { detail: resolved }));
  }
  return resolved;
}

/// Adopt an account-level preference on a device that has never expressed one.
///
/// Deliberately does NOT overwrite an existing local choice. The account setting
/// and the nav toggle are different acts: one says "this is my preference", the
/// other says "make this screen readable right now". A signed-in user who flips
/// the nav toggle on a shared laptop should not have it silently undone the next
/// time the settings page loads.
export function adoptPreferenceIfUnset(pref: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch {
    return;
  }
  setThemePreference(pref);
}

/// `mounted` is false through the server render and the first client render.
/// Callers use it to hold a same-size placeholder: the stored theme is not
/// readable during SSR, so rendering the real control immediately would ship
/// markup for the wrong theme and hydrate into a mismatch.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(readTheme());
    applyTheme(readTheme());
    setMounted(true);

    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === 'light' || next === 'dark') setThemeState(next);
    };
    window.addEventListener(CHANGE_EVENT, onChange);

    // While the preference is 'system', follow the OS live. Without this,
    // "system" only meant "whatever the system was at page load", so a machine
    // that flips at sunset would leave the app on the wrong theme until reload.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem = () => {
      if (readPreference() !== 'system') return;
      const next = systemTheme();
      applyTheme(next);
      setThemeState(next);
    };
    media.addEventListener('change', onSystem);

    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      media.removeEventListener('change', onSystem);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(setThemePreference(next));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggle, mounted };
}
