'use client';
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/// Must stay in lockstep with the anti-FOUC script in app/layout.tsx, which runs
/// the same read before first paint. If the two ever disagree the page paints one
/// theme and then swaps, which is the flash the inline script exists to prevent.
const STORAGE_KEY = 'karwan-theme';

/// Fires when any mounted control changes the theme, so a second switcher on the
/// page updates its own label instead of showing the theme the user just left.
const CHANGE_EVENT = 'karwan-theme-change';

export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private browsing and blocked storage both throw here. Falling through to
    // the OS preference is better than failing to render a control at all.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

/// `mounted` is false through the server render and the first client render.
/// Callers use it to hold a same-size placeholder: the stored theme is not
/// readable during SSR, so rendering the real control immediately would ship
/// markup for the wrong theme and hydrate into a mismatch.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = readTheme();
    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);

    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === 'light' || next === 'dark') setThemeState(next);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still applies for this session; only persistence is lost.
    }
    window.dispatchEvent(new CustomEvent<Theme>(CHANGE_EVENT, { detail: next }));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggle, mounted };
}
