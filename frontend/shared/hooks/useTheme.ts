'use client';
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/// What the user asked for, which is not the same as what gets painted.
/// 'system' is retained as the stored compatibility value for the visible
/// Daylight option. It resolves from local time rather than being frozen into
/// a stored 'light' or 'dark' value.
export type ThemePreference = Theme | 'system';

/// Must stay in lockstep with the pre-paint script in app/layout.tsx, which runs
/// the same read before first paint. If the two ever disagree the page paints one
/// theme and then swaps, which is the flash that script exists to prevent.
const STORAGE_KEY = 'karwan-theme';

/// Fires when any mounted control changes the theme, so a second switcher on the
/// page updates its own label instead of showing the theme the user just left.
const CHANGE_EVENT = 'karwan-theme-change';

/// Nightfall and first light, in local hours. Not astronomical dusk: a fixed
/// pair of hours needs no location permission, no geocoding, and no network,
/// and it lands within an hour of real sunset across the trade lanes Karwan
/// runs on. The device's own clock supplies the timezone.
const NIGHT_FROM_HOUR = 19;
const DAY_FROM_HOUR = 7;

function isNightLocally(now = new Date()): boolean {
  const hour = now.getHours();
  return hour >= NIGHT_FROM_HOUR || hour < DAY_FROM_HOUR;
}

/// Daylight uses local device time. Date's local getters follow the timezone
/// configured on the device, including its daylight-saving transitions.
export function resolveDaylightTheme(now = new Date()): Theme {
  return isNightLocally(now) ? 'dark' : 'light';
}

/// Milliseconds until the automatic theme could next change, i.e. the next
/// crossing of either boundary hour. Used to schedule one timer instead of
/// polling the clock.
export function msUntilNextDaylightChange(now = new Date()): number {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  do {
    next.setHours(next.getHours() + 1);
  } while (next.getHours() !== NIGHT_FROM_HOUR && next.getHours() !== DAY_FROM_HOUR);
  return Math.max(60_000, next.getTime() - now.getTime());
}

/// The stored preference, or dark when there is none. Anything unrecognised
/// also falls back to dark so the first visit is stable and intentional.
export function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private browsing and blocked storage both throw here.
  }
  return 'dark';
}

export function resolveTheme(pref: ThemePreference): Theme {
  return pref === 'system' ? resolveDaylightTheme() : pref;
}

export function readTheme(): Theme {
  return resolveTheme(readPreference());
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

  // Now that the theme changes on its own at the daylight boundaries, the
  // change has to be legible as a change. A whole page swapping ink and paper
  // between one frame and the next reads as a glitch; the same swap over
  // 380ms reads as the room's light changing, which is what it is.
  root.classList.add('theme-shifting');
  window.clearTimeout(shiftTimer);
  shiftTimer = window.setTimeout(() => root.classList.remove('theme-shifting'), SHIFT_MS + 40);

  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
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
/// Deliberately does NOT overwrite an existing local choice. A device that has
/// been switched off automatic locally keeps that choice; the account setting
/// only seeds machines that have never been told anything.
export function adoptPreferenceIfUnset(pref: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch {
    return;
  }
  setThemePreference(pref);
}

/// Read-only view of the painted theme, kept live: it follows the daylight
/// boundary and any other control that writes a preference.
/// Writes go through `setThemePreference`, not through here.
///
/// `mounted` is false through the server render and the first client render.
/// Callers use it to hold a same-size placeholder: the stored theme is not
/// readable during SSR, so rendering the real control immediately would ship
/// markup for the wrong theme and hydrate into a mismatch.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');
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

    // While the stored preference is 'system' (shown as Daylight), follow the
    // local clock live. Without this, a tab left open at sunset would remain on
    // the daytime surface until the next reload.
    const onDaylight = () => {
      if (readPreference() !== 'system') return;
      const next = resolveDaylightTheme();
      applyTheme(next);
      setThemeState(next);
    };

    // The other half of Daylight: the clock. Without this, a session left
    // open through sunset kept the daytime theme until the next reload. One
    // timer per boundary crossing, rescheduled from the theme it just applied,
    // so an all-night tab costs two wakeups.
    let timer = 0;
    const scheduleDaylight = () => {
      timer = window.setTimeout(() => {
        onDaylight();
        scheduleDaylight();
      }, msUntilNextDaylightChange());
    };
    scheduleDaylight();

    // A machine that slept through the boundary comes back on the wrong theme,
    // and no timer fires for the hours it was asleep.
    const onWake = () => onDaylight();
    document.addEventListener('visibilitychange', onWake);

    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      document.removeEventListener('visibilitychange', onWake);
      window.clearTimeout(timer);
    };
  }, []);

  return { theme, mounted };
}
