'use client';
import { useCallback, useEffect, useState } from 'react';

/// Lightweight clipboard hook with a transient "copied" flag so a button can
/// flash a checkmark for ~1.4s after a successful copy. Falls back to the
/// legacy execCommand path on browsers that don't expose navigator.clipboard
/// (mostly older mobile Safari over HTTP). No-op on the server.
export function useClipboard(resetAfterMs = 1400): {
  copied: boolean;
  copy: (text: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), resetAfterMs);
    return () => clearTimeout(t);
  }, [copied, resetAfterMs]);

  const copy = useCallback(async (text: string) => {
    if (typeof window === 'undefined') return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        try {
          document.execCommand('copy');
        } finally {
          document.body.removeChild(el);
        }
      }
      setCopied(true);
    } catch {
      /* user denied clipboard permission; surface nothing rather than throw */
    }
  }, []);

  return { copied, copy };
}
