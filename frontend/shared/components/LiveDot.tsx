'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';

const TONE = {
  live: { color: '#0a7553', label: 'Live' },
  connecting: { color: 'var(--color-ink-faint)', label: 'Connecting' },
  offline: { color: '#b03d3a', label: 'Offline' },
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
  const pinging = state === 'live';

  return (
    <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--color-ink-dim)]">
      <span aria-hidden className="relative inline-flex w-[6px] h-[6px]">
        {pinging && (
          <span
            className="absolute inset-0 rounded-full opacity-55 motion-safe:animate-ping"
            style={{ background: t.color }}
          />
        )}
        <span
          className="relative inline-flex w-[6px] h-[6px] rounded-full"
          style={{ background: t.color }}
        />
      </span>
      <span>{t.label}</span>
    </span>
  );
}
