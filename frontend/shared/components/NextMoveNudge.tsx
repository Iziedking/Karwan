'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { nextMoveCopy } from '@/shared/i18n/messages/nextMove';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { isAssistantRoute, isPublicEditorialRoute } from '@/shared/utils/routes';
import { dur, ease } from '@/shared/motion/tokens';
import { useOwnedBalance } from '@/features/money/hooks/useOwnedBalance';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { pickNudge, type Nudge } from '@/features/guide/pickNudge';
import { coversControl } from '@/features/guide/coversControl';

const CLOSED_KEY = 'karwan:nextMove:closed';
const SHOW_AFTER_MS = 1200;

function readClosed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CLOSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function typingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

/// The one next move, as one line and one button (view 57). Quiet by rule:
/// never on the page it points to, never while typing, never over a dialog,
/// never on top of a button, one line a page visit, and a closed move stays
/// closed for the visit.
export function NextMoveNudge() {
  const pathname = usePathname() ?? '/';
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = nextMoveCopy[locale];
  const money = useMoneyText();
  const owned = useOwnedBalance();
  const reduce = useHydratedReducedMotion();
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [typing, setTyping] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [closedHere, setClosedHere] = useState(false);
  const [covering, setCovering] = useState(false);
  const noteRef = useRef<HTMLElement | null>(null);

  const quietRoute =
    isPublicEditorialRoute(pathname) || isAssistantRoute(pathname) || pathname.startsWith('/setup') || pathname.startsWith('/admin');
  const signedIn = !auth.isLoading && auth.isAuthenticated;

  const { data } = useQuery({
    queryKey: ['guide-next'],
    queryFn: () => api.guideNext(),
    enabled: signedIn && !quietRoute,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => setClosed(readClosed()), []);

  useEffect(() => {
    setReady(false);
    setClosedHere(false);
    const t = window.setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const onIn = (e: FocusEvent) => setTyping(typingTarget(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    const check = () => setDialog(!!document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'role'] });
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      observer.disconnect();
    };
  }, []);

  const nudge = useMemo<Nudge | null>(
    () => (data && Array.isArray(data.moves) ? pickNudge({ moves: data.moves, balanceTotal: owned.loading ? null : owned.total, pathname, closed }) : null),
    [data, owned.loading, owned.total, pathname, closed],
  );

  const close = (key: string) => {
    const next = new Set(closed).add(key);
    setClosed(next);
    setClosedHere(true);
    try {
      sessionStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
    } catch {
      /* private browsing: closed for this page only */
    }
  };

  const lineFor = (n: Nudge): string => {
    const amount = n.amountUsdc ? money.price(n.amountUsdc, n.agreedLocal ?? null) : '';
    let template = copy.moves[n.kind].line;
    if (n.kind === 'deliver_soon' && n.days === 1) template = copy.deliverSoonOne;
    if (n.kind === 'choose_offer' && n.count === 1) template = copy.chooseOfferOne;
    const num = (v: number | undefined) => (v === undefined ? '' : new Intl.NumberFormat(locale).format(v));
    return template.replace('{amount}', amount).replace('{days}', num(n.days)).replace('{count}', num(n.count));
  };

  const show = signedIn && !quietRoute && ready && !typing && !dialog && !closedHere && nudge !== null;
  const shownKey = show && nudge ? nudge.key : null;

  // The note steps aside while it would sit on a button, and comes back when
  // the page scrolls the button out from under it.
  useLayoutEffect(() => {
    if (!shownKey) {
      setCovering(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = noteRef.current;
      if (!el) return;
      setCovering(coversControl(el.getBoundingClientRect(), (x, y) => document.elementsFromPoint(x, y), (hit) => el.contains(hit)));
    };
    const later = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', later, { capture: true, passive: true });
    window.addEventListener('resize', later);
    const observer = new MutationObserver(later);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', later, { capture: true });
      window.removeEventListener('resize', later);
      observer.disconnect();
    };
  }, [shownKey]);

  return (
    <AnimatePresence>
      {show && nudge ? (
        <m.aside
          key={nudge.key}
          ref={noteRef}
          aria-label={copy.label}
          aria-hidden={covering || undefined}
          data-next-move={nudge.kind}
          data-aside={covering ? '' : undefined}
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : 6 }}
          transition={{ duration: reduce ? dur.micro : dur.base, ease: ease.out }}
          className="guide-voice fixed start-4 bottom-24 z-50 w-[min(360px,calc(100vw-6.5rem))] rounded-[20px] rounded-es-[8px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-4 pb-3.5 pt-3 text-[var(--ink)] shadow-[0_14px_36px_-14px_rgba(0,0,0,0.45)] data-[aside]:invisible lg:start-5 lg:bottom-5"
        >
          <div className="flex items-start gap-2">
            <p role="status" className="min-w-0 flex-1 pt-0.5 text-[16px] font-semibold leading-[1.3]">
              {lineFor(nudge)}
            </p>
            <button
              type="button"
              onClick={() => close(nudge.key)}
              aria-label={copy.close}
              className="-me-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <Link
            href={nudge.href}
            onClick={() => close(nudge.key)}
            className="mt-2.5 inline-flex min-h-10 items-center rounded-full bg-[var(--action)] px-4 text-[15px] font-bold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--soft-green)]"
          >
            {copy.moves[nudge.kind].action}
          </Link>
        </m.aside>
      ) : null}
    </AnimatePresence>
  );
}
