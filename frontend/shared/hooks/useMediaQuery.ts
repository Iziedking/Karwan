'use client';
import { useSyncExternalStore } from 'react';

/// Whether a media query matches. False on the server and on first paint, so a
/// part that must mount on one layout only waits for the browser to say which.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/// The deal page puts the conversation beside the deal from this width up.
export const DESKTOP_QUERY = '(min-width: 1024px)';
