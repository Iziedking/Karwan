'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';

// Body matches the wallet chip (var(--color-ink)) so all navbar instrument
// chips read as one family. Status color lives inside the LED cell only.
const TONE = {
  live: { cell: '#0a7553', label: 'LIVE' },
  connecting: { cell: '#6b6b6b', label: 'CONNECTING' },
  offline: { cell: '#b03d3a', label: 'OFFLINE' },
} as const;

export function LiveDot() {
  const [state, setState] = useState<'connecting' | 'live' | 'offline'>('connecting');

  useEffect(() => {
    const es = new EventSource(api.eventsUrl());
    const onOpen = () => setState('live');
    es.addEventListener('open', onOpen);
    es.onopen = onOpen;
    es.onerror = () => setState('offline');
    return () => es.close();
  }, []);

  const t = TONE[state];

  return (
    <span
      className="inline-flex items-stretch overflow-hidden mono text-[10px] font-bold uppercase tracking-[0.18em] leading-none text-white"
      style={{
        background: 'var(--color-ink)',
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderBottomLeftRadius: 5,
        borderBottomRightRadius: 2,
        boxShadow: '0 2px 0 rgba(0,0,0,0.22)',
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center px-1.5"
        style={{ background: t.cell }}
      >
        <span
          aria-hidden
          data-instrument-blink={state === 'live' || undefined}
          className="inline-block w-[5px] h-[5px] bg-white"
          style={{
            animation: state === 'live' ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
          }}
        />
      </span>
      <span className="px-2 py-[6px]">{t.label}</span>
    </span>
  );
}
