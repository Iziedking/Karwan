'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import type { TagLookup } from '../moneySheetModel';

/// Looks up a Karwan tag while the person types, after a short pause. A newer
/// tag always wins over a slower answer for an older one.
export function useTagRecipient(tag: string | null): TagLookup | null {
  const [lookup, setLookup] = useState<{ tag: string; value: TagLookup } | null>(null);

  useEffect(() => {
    if (!tag) return;
    let live = true;
    setLookup({ tag, value: { state: 'checking' } });
    const timer = setTimeout(() => {
      api.resolveKarwanTag(tag).then(
        (result) => { if (live) setLookup({ tag, value: { state: 'done', result } }); },
        () => { if (live) setLookup({ tag, value: { state: 'error' } }); },
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [tag]);

  if (!tag) return null;
  return lookup?.tag === tag ? lookup.value : { state: 'checking' };
}
