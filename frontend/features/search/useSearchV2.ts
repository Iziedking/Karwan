'use client';
import { useEffect, useState } from 'react';
import { searchV2Enabled } from './searchSwitch';

/// Starts from the build flag so the first render matches the server's, then
/// applies a ?search= override once mounted.
export function useSearchV2(): boolean {
  const [on, setOn] = useState(process.env.NEXT_PUBLIC_SEARCH_V2 === '1');
  useEffect(() => {
    setOn(searchV2Enabled(process.env.NEXT_PUBLIC_SEARCH_V2, window.location.search));
  }, []);
  return on;
}
