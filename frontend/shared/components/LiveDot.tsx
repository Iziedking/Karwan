'use client';
import { useEffect, useState } from 'react';
import { subscribeLiveStatus, type LiveStatus } from '@/shared/utils/liveEventBus';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const COLOR: Record<LiveStatus, string> = {
  live: '#0a7553',
  connecting: 'var(--color-ink-faint)',
  offline: '#b03d3a',
};

export function LiveDot() {
  const tr = useTranslations().liveDot;
  const [state, setState] = useState<LiveStatus>('connecting');

  useEffect(() => subscribeLiveStatus(setState), []);

  const color = COLOR[state];
  const label = tr[state];
  const pinging = state === 'live';

  return (
    <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--color-ink-dim)]">
      <span aria-hidden className="relative inline-flex w-[6px] h-[6px]">
        {pinging && (
          <span
            className="absolute inset-0 rounded-full opacity-55 motion-safe:animate-ping"
            style={{ background: color }}
          />
        )}
        <span
          className="relative inline-flex w-[6px] h-[6px] rounded-full"
          style={{ background: color }}
        />
      </span>
      <span>{label}</span>
    </span>
  );
}
