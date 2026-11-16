'use client';

import { useEffect, useMemo, useState } from 'react';
import { LiveAman } from '@/shared/guide/LiveAman';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import type { TipKind } from '@/shared/i18n/messages/assistantTips';
import { statusLine, type WaitStep } from './waitStatus';
import { nextTipSeed, pickTips } from './pickTips';
import { Dot } from './AssistantThread';

/// The first tip waits this long, so a quick answer never flashes one.
export const TIP_AFTER_MS = 900;
/// A tip stays this long before the next, long enough to read twice (owner,
/// 16 Nov 2026: "it just appears with speed and leaves").
export const TIP_STAYS_MS = 6000;

export type ShownTip = { kind: TipKind; text: string; at: number };

const ICON: Record<TipKind, 'shield-check' | 'wallet' | 'shield' | 'badge-check'> = {
  deal: 'shield-check',
  money: 'wallet',
  safety: 'shield',
  record: 'badge-check',
};

/// What the page shows while Aman works (view 84, Figma 330:2078): Aman
/// thinking, a line for the step it is on, and on a longer wait one tip at a
/// time with a thin line for how long it stays.
export function AssistantWait({ wait, from, onTip }: { wait: { status: WaitStep | null; startedAt: number }; from: string | null; onTip?: (tip: ShownTip) => void }) {
  const copy = useTranslations();
  const w = copy.assistantWait;
  // Each wait opens on the tip after the last one this device showed.
  const [seed] = useState(() => nextTipSeed(typeof window === 'undefined' ? null : window.localStorage));
  const tips = useMemo(() => pickTips(from, seed, copy.assistantTips), [from, seed, copy.assistantTips]);
  const reduce = useHydratedReducedMotion();
  const line = statusLine(wait.status, w);

  // Which tip shows: none before 900 ms, then the next every 3.5 s.
  const [tipIndex, setTipIndex] = useState<number | null>(null);
  useEffect(() => {
    const first = Math.max(0, TIP_AFTER_MS - (Date.now() - wait.startedAt));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let next = 0;
    const show = () => {
      setTipIndex(next);
      next = (next + 1) % Math.max(1, tips.length);
      timer = setTimeout(show, TIP_STAYS_MS);
    };
    timer = setTimeout(show, first);
    return () => clearTimeout(timer);
  }, [wait.startedAt, tips.length]);

  const tip = tipIndex === null ? null : tips[tipIndex] ?? null;
  useEffect(() => {
    if (tip) onTip?.({ ...tip, at: Date.now() });
  }, [tip, onTip]);

  return (
    <div data-wait className="space-y-3">
      <div className="flex items-center gap-2.5">
        <LiveAman size={30} mood="thinking" look={null} seed="wait" />
        <p aria-live="polite" className="text-[15px] font-medium text-[var(--ink-secondary)]">
          <span key={line} className={reduce ? undefined : 'wait-line-in'}>
            {line}
          </span>
        </p>
        <span aria-hidden className="inline-flex gap-1">
          <Dot /> <Dot /> <Dot />
        </span>
      </div>
      {tip ? <TipCard key={tip.text} tip={tip} label={w.tipLabels[tip.kind]} stays={TIP_STAYS_MS} reduce={reduce} /> : null}
    </div>
  );
}

/// One tip, with a thin line for how long it stays.
export function TipCard({ tip, label, stays, reduce }: { tip: { kind: TipKind; text: string }; label: string; stays: number; reduce: boolean }) {
  return (
    <div
      data-wait-tip
      aria-hidden
      className={`ms-10 max-w-[340px] rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-4 pb-3 pt-3.5${reduce ? '' : ' wait-tip-in'}`}
    >
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--action)]">
        <Icon name={ICON[tip.kind]} size={16} />
        {label}
      </p>
      <p className="mt-2 text-[15px] leading-snug text-[var(--ink)]">{tip.text}</p>
      <span className="mt-3 block h-[3px] overflow-hidden rounded-full bg-[var(--line)]">
        <span
          className={`block h-full rounded-full bg-[var(--action)]${reduce ? ' w-full' : ' wait-tip-time'}`}
          style={reduce ? undefined : { animationDuration: `${stays}ms` }}
        />
      </span>
    </div>
  );
}
