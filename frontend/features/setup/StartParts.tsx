'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { ease } from '@/shared/motion/tokens';

/// Account, Tag, About you: the one bar a new person sees from the first
/// screen of /start to Home (view 39). `part` is the one in progress and `fill`
/// how far through it they are, from 0 to 1.
export function StartBar({ part, fill = 0 }: { part: 0 | 1 | 2 | 3; fill?: number }) {
  const t = useTranslations().startFlow.bar;
  const reduce = useHydratedReducedMotion();
  const names = [t.account, t.tag, t.about];
  const label = part > 2 ? names[2]! : names[part]!;
  return (
    <div
      role="progressbar"
      aria-label={t.step.replace('{n}', String(Math.min(part + 1, 3))).replace('{name}', label)}
      aria-valuemin={0}
      aria-valuemax={3}
      aria-valuenow={Math.min(part + fill, 3)}
      className="grid flex-1 grid-cols-3 gap-1.5"
    >
      {[0, 1, 2].map((i) => {
        const width = i < part ? 1 : i === part ? Math.max(fill, 0.08) : 0;
        return (
          <span key={i} className="h-1 overflow-hidden rounded-full bg-[var(--line,var(--lp-border-light))]">
            <motion.span
              className={`block h-full rounded-full ${i < part ? 'bg-[var(--lp-accent)]' : 'bg-[var(--ink,var(--lp-dark))]'}`}
              initial={false}
              animate={{ width: `${Math.round(width * 100)}%` }}
              transition={{ duration: reduce ? 0 : 0.32, ease: ease.out }}
            />
          </span>
        );
      })}
    </div>
  );
}

/// One line from Karwan, or from the person's agent once the account exists,
/// saying what the step is for. It is announced when it changes.
export function Nudge({ from, children, live = false }: { from: 'karwan' | 'agent'; children: ReactNode; live?: boolean }) {
  const t = useTranslations().startFlow;
  return (
    <div className="flex items-start gap-3" role={live ? 'status' : undefined}>
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-[var(--lp-accent)] bg-[var(--offer-surface)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/karwan-app-icon.svg" alt="" width="18" height="18" className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1 rounded-[4px_18px_18px_18px] border border-[var(--line,var(--lp-border-light))] bg-[var(--surface,var(--lp-card))] px-4 py-3 rtl:rounded-[18px_4px_18px_18px]">
        <p className="text-[13px] font-semibold text-[var(--ink-secondary,var(--lp-text-sub))]">{from === 'karwan' ? t.fromKarwan : t.fromAgent}</p>
        <div className="mt-1 text-[15px] font-medium leading-relaxed text-[var(--ink,var(--lp-dark))]">{children}</div>
      </div>
    </div>
  );
}
