'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { ease } from '@/shared/motion/tokens';
import { readingMs } from './guideTiming';

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
            <m.span
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

const HIDDEN_KEY = 'karwan.signupGuide.hidden';

function guideHidden(): boolean {
  try {
    return window.sessionStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

/// The sign-up guide (view 54): one line from Karwan, or from the person's
/// agent once the account exists, answering what they just did. It pops up in
/// the open space beside the form on a computer, or at the top of a phone
/// screen, stays long enough to read, then fades away. Closed, it stays away
/// for the rest of sign-up. `inline` keeps a line in the page instead, for the
/// agent's read-back a person checks before going on.
export function Nudge({ from, children, live = false, inline = false }: { from: 'karwan' | 'agent'; children: ReactNode; live?: boolean; inline?: boolean }) {
  if (inline) return <NudgeBubble from={from} live={live}>{children}</NudgeBubble>;
  return <GuidePop from={from}>{children}</GuidePop>;
}

function Mark({ pulse }: { pulse: boolean }) {
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-[var(--lp-accent)] bg-[var(--offer-surface)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/karwan-app-icon.svg" alt="" width="18" height="18" className={`size-[18px] ${pulse ? 'motion-safe:animate-[pulse_1.2s_ease-in-out_infinite]' : ''}`} />
    </span>
  );
}

function NudgeBubble({ from, children, live }: { from: 'karwan' | 'agent'; children: ReactNode; live: boolean }) {
  const t = useTranslations().startFlow;
  return (
    <div className="flex items-start gap-3" role={live ? 'status' : undefined}>
      <Mark pulse={false} />
      <div className="min-w-0 flex-1 rounded-[4px_18px_18px_18px] border border-[var(--line,var(--lp-border-light))] bg-[var(--surface,var(--lp-card))] px-4 py-3 rtl:rounded-[18px_4px_18px_18px]">
        <p className="text-[13px] font-semibold text-[var(--ink-secondary,var(--lp-text-sub))]">{from === 'karwan' ? t.fromKarwan : t.fromAgent}</p>
        <div className="mt-1 text-[15px] font-medium leading-relaxed text-[var(--ink,var(--lp-dark))]">{children}</div>
      </div>
    </div>
  );
}

function GuidePop({ from, children }: { from: 'karwan' | 'agent'; children: ReactNode }) {
  const t = useTranslations().startFlow;
  const reduce = useHydratedReducedMotion();
  const wide = useMediaQuery('(min-width: 1240px)');
  const textRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [shown, setShown] = useState(false);
  const [held, setHeld] = useState(false);
  const line = typeof children === 'string' ? children : '';

  useEffect(() => {
    setMounted(true);
    setClosed(guideHidden());
  }, []);
  // Each new line shows again.
  useEffect(() => {
    if (mounted) setShown(true);
  }, [mounted, line]);
  // It stays long enough to read twice, unless the pointer or focus rests on it.
  useEffect(() => {
    if (!shown || held) return;
    const words = (textRef.current?.textContent ?? line).trim().split(/\s+/).filter(Boolean).length;
    const timer = window.setTimeout(() => setShown(false), readingMs(words));
    return () => window.clearTimeout(timer);
  }, [shown, held, line]);

  if (!mounted || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      window.sessionStorage.setItem(HIDDEN_KEY, '1');
    } catch {}
  };
  const enter = reduce ? { opacity: 0 } : wide ? { opacity: 0, x: -16 } : { opacity: 0, y: -12 };
  const leave = reduce ? { opacity: 0 } : wide ? { opacity: 0, y: -8 } : { opacity: 0, y: -12 };
  return createPortal(
    <div className={wide ? 'pointer-events-none fixed inset-y-0 start-[calc(50%+300px)] z-40 flex w-[320px] items-center' : 'pointer-events-none fixed inset-x-3 top-[calc(var(--lp-nav-h,64px)+8px)] z-40'}>
      <AnimatePresence>
        {shown ? (
          <m.div
            key={line || 'guide'}
            data-signup-guide
            role="status"
            aria-live="polite"
            initial={enter}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={leave}
            transition={{ duration: reduce ? 0.12 : wide ? 0.28 : 0.24, ease: ease.out }}
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
            className="pointer-events-auto flex w-full items-start gap-3 rounded-[16px] border border-[var(--line,var(--lp-border-light))] bg-[var(--surface,var(--lp-card))] px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
          >
            <Mark pulse={!reduce} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--ink-secondary,var(--lp-text-sub))]">{from === 'karwan' ? t.fromKarwan : t.fromAgent}</p>
              <div ref={textRef} className={`mt-0.5 font-medium leading-snug text-[var(--ink,var(--lp-dark))] ${wide ? 'text-[17px]' : 'line-clamp-2 text-[15px]'}`}>{children}</div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t.guideClose}
              className="-me-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-[var(--ink-secondary,var(--lp-text-sub))] hover:text-[var(--ink,var(--lp-dark))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
