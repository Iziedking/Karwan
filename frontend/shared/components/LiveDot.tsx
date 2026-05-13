'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';

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

  const color =
    state === 'live'
      ? 'bg-[var(--color-positive)]'
      : state === 'offline'
        ? 'bg-[var(--color-critical)]'
        : 'bg-[var(--color-ink-faint)]';

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-ink-dim)]">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span>{state === 'live' ? 'live' : state}</span>
    </span>
  );
}
