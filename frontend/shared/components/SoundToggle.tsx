'use client';
import { useEffect, useState } from 'react';
import { sfx } from '@/shared/utils/sfx';

/// Mute toggle for the synthesized UI sounds. Reflects and persists the sfx
/// mute state.
export function SoundToggle() {
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    setMuted(sfx.muted);
    return sfx.subscribe(setMuted);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const nowMuted = sfx.toggle();
        if (!nowMuted) sfx.tap();
      }}
      aria-label={muted ? 'Enable sound' : 'Mute sound'}
      title={muted ? 'Enable sound' : 'Mute sound'}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
    >
      {muted ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M11 5 6 9H3v6h3l5 4V5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M11 5 6 9H3v6h3l5 4V5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
