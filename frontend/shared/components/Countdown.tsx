'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Live countdown to a fixed instant. Re-renders every second so the time
/// readout never goes stale. Returns "0s" once the deadline passes; callers
/// decide what to render after that.
export function Countdown({ targetMs, prefix = '' }: { targetMs: number; prefix?: string }) {
  const t = useTranslations().countdown;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const delta = Math.max(0, targetMs - now);
  if (delta === 0) return <>{prefix}{t.closed}</>;

  const days = Math.floor(delta / 86_400_000);
  const hours = Math.floor((delta % 86_400_000) / 3_600_000);
  const minutes = Math.floor((delta % 3_600_000) / 60_000);
  const seconds = Math.floor((delta % 60_000) / 1000);

  return (
    <span className="tabular-nums">
      {prefix}
      {days > 0 && (
        <>
          {days}d <span className="opacity-60">·</span>{' '}
        </>
      )}
      {String(hours).padStart(2, '0')}h <span className="opacity-60">·</span>{' '}
      {String(minutes).padStart(2, '0')}m <span className="opacity-60">·</span>{' '}
      {String(seconds).padStart(2, '0')}s
    </span>
  );
}
