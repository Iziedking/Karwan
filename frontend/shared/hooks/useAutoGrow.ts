'use client';
import { useLayoutEffect, useRef } from 'react';

/// A message box that grows with what is typed, up to its max-height, so a
/// long message is never cut in half on a phone. Shrinks back when cleared.
export function useAutoGrow<T extends HTMLTextAreaElement>(value: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}
