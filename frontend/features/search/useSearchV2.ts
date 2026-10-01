'use client';
import { useLayoutEffect, useState } from 'react';
import { forcedSearchVersion, SEARCH_CHOICE_KEY, searchV2Enabled } from './searchSwitch';

/// Starts from the build flag so the first render matches the server's, then
/// applies a ?search= override before the first paint, so a requested version
/// never flashes the other one, and remembers it for the session.
export function useSearchV2(): boolean {
  const [on, setOn] = useState(process.env.NEXT_PUBLIC_SEARCH_V2 === '1');
  useLayoutEffect(() => {
    let remembered: string | null = null;
    try {
      const forced = forcedSearchVersion(window.location.search);
      if (forced) sessionStorage.setItem(SEARCH_CHOICE_KEY, forced);
      remembered = sessionStorage.getItem(SEARCH_CHOICE_KEY);
    } catch {
      // Storage can be blocked; the URL and the build flag still decide.
    }
    setOn(searchV2Enabled(process.env.NEXT_PUBLIC_SEARCH_V2, window.location.search, remembered));
  }, []);
  return on;
}
