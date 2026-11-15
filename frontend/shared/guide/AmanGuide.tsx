'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { nextMoveCopy } from '@/shared/i18n/messages/nextMove';
import { guideCopy } from '@/shared/i18n/messages/guide';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { isAssistantRoute, isPublicEditorialRoute } from '@/shared/utils/routes';
import { dur, ease } from '@/shared/motion/tokens';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { anchorFor, pickNudge, stepFinished, type Nudge, type SetupKey } from '@/features/guide/pickNudge';
import { coversControl } from '@/features/guide/coversControl';
import { FACE, placeAman, type Placement, type Rect } from '@/features/guide/placeAman';
import { ENTER_S, FAST_SCROLL, PLEASED_MS, blinkDelay, enterFrom, isMoneyFlow, mayMove, maySpeak } from '@/features/guide/amanMotion';
import { afterNotNow, afterQuietHere, emptyVisit, hiddenNow, isQuiet, readVisit, writeVisit, type Visit } from '@/features/guide/guideChoices';
import { useGuideSetting } from '@/features/guide/useGuideSetting';
import { openAssistant } from '@/shared/assistant/openAssistant';
import { useAssistantShortcut } from '@/shared/assistant/useAssistantShortcut';
import type { AmanMood } from '@/features/guide/amanDots';
import { AmanFace } from './AmanFace';
import { AmanMenu } from './AmanMenu';

const SHOW_AFTER_MS = 1200;
const HOLD_MS = 500;
const BLINK_MS = 140;
const MOVE_S = 0.26;

const quietRoute = (p: string) =>
  isPublicEditorialRoute(p) || isAssistantRoute(p) || /^\/(?:setup|admin|start|onboarding)(?:\/|$)/.test(p);

function typingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

function rectOf(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function bottomBarHeight(): number {
  const nav = document.querySelector<HTMLElement>('[data-workspace-bottom-nav]');
  if (!nav) return 0;
  const r = nav.getBoundingClientRect();
  return r.height > 0 && r.top < window.innerHeight ? Math.max(0, window.innerHeight - r.top) : 0;
}

const gazeAt = (from: { x: number; y: number }, to: { x: number; y: number }) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const reach = Math.min(1, d / 160);
  return { x: (dx / d) * reach, y: (dy / d) * reach };
};

/// Aman, the guide with a face (view 57): out of sight until a deal or a setup
/// step needs the person, then beside the page with the one next move, and gone
/// again after it. Quiet while a person types, scrolls fast, reads a dialog or
/// moves money. Tap opens the assistant page; press and hold opens its menu.
export function AmanGuide() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = guideCopy[locale];
  const moveCopy = nextMoveCopy[locale];
  const money = useMoneyText();
  const reduce = useHydratedReducedMotion();
  const { guide, loaded, set: setGuide } = useGuideSetting();

  const signedIn = !auth.isLoading && auth.isAuthenticated;
  const quiet = quietRoute(pathname);
  useAssistantShortcut(signedIn);

  const [visit, setVisit] = useState<Visit>(emptyVisit);
  const [ready, setReady] = useState(false);
  const [typing, setTyping] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [fastScroll, setFastScroll] = useState(false);
  const [spokenKey, setSpokenKey] = useState<string | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const [lineCovering, setLineCovering] = useState(false);
  const [faceCovering, setFaceCovering] = useState(false);
  const [menu, setMenu] = useState(false);
  const [blink, setBlink] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [rtl, setRtl] = useState(false);
  const [pleased, setPleased] = useState(false);
  const spokenStep = useRef<SetupKey | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const faceRef = useRef<HTMLButtonElement | null>(null);
  const held = useRef<number | null>(null);
  const heldOpened = useRef(false);

  const active = signedIn && !quiet && loaded && guide === 'on';

  const { data, refetch } = useQuery({
    queryKey: ['guide-next'],
    queryFn: () => api.guideNext(),
    enabled: active,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    try { setVisit(readVisit(sessionStorage)); } catch { /* no storage */ }
    setRtl(document.documentElement.dir === 'rtl');
  }, [locale]);

  // A new page reads the moves again, so a step done on the last page is seen.
  useEffect(() => {
    if (active) void refetch();
  }, [pathname, active, refetch]);

  useEffect(() => {
    setReady(false);
    setSpokenKey(null);
    setMenu(false);
    const t = window.setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!active) return;
    const onIn = (e: FocusEvent) => setTyping(typingTarget(e.target));
    const onOut = () => setTyping(false);
    const check = () => setDialog(!!document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]'));
    let lastY = window.scrollY;
    let lastT = performance.now();
    let calm = 0;
    const onScroll = () => {
      const now = performance.now();
      const speed = (Math.abs(window.scrollY - lastY) / Math.max(1, now - lastT)) * 1000;
      lastY = window.scrollY;
      lastT = now;
      if (speed > FAST_SCROLL) setFastScroll(true);
      window.clearTimeout(calm);
      calm = window.setTimeout(() => setFastScroll(false), 220);
    };
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'mouse') setPointer({ x: e.clientX, y: e.clientY }); };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'role'] });
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(calm);
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove);
    };
  }, [active]);

  // A blink every 4 to 7 seconds, the same rhythm for the same page visit.
  useEffect(() => {
    if (!active || reduce) return;
    const seed = [...pathname].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    let n = 0;
    let t = 0;
    const next = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        t = window.setTimeout(() => { setBlink(false); n += 1; next(); }, BLINK_MS);
      }, blinkDelay(seed, n));
    };
    next();
    return () => window.clearTimeout(t);
  }, [active, reduce, pathname]);

  const nudge = useMemo<Nudge | null>(
    () => (data && Array.isArray(data.moves) ? pickNudge({ moves: data.moves, pathname, closed: new Set() }) : null),
    [data, pathname],
  );

  const moneyFlow = isMoneyFlow(pathname);
  const speaking =
    active &&
    ready &&
    nudge !== null &&
    !hiddenNow(visit, pathname, false) &&
    maySpeak({ typing, dialogOpen: dialog, moneyFlow, spokenThisVisit: spokenKey !== null && spokenKey !== nudge.key, quietHere: isQuiet(visit, pathname), guide });
  const moving = mayMove({ typing, fastScroll, dialogOpen: dialog, moneyFlow, reducedMotion: reduce });
  const anchorName = speaking && nudge && !reduce ? anchorFor(nudge) : null;
  const hold = typing || fastScroll || dialog;

  useEffect(() => {
    if (!speaking || !nudge) return;
    setSpokenKey(nudge.key);
    spokenStep.current = nudge.kind === 'setup_step' ? nudge.step ?? null : null;
  }, [speaking, nudge]);

  // The step Aman named is done: pleased for a moment, then gone (view 57, 15 Nov).
  useEffect(() => {
    if (!active || !data || !Array.isArray(data.moves) || moneyFlow) return;
    if (!stepFinished(spokenStep.current, data.moves)) return;
    spokenStep.current = null;
    setPleased(true);
    const t = window.setTimeout(() => setPleased(false), PLEASED_MS);
    return () => window.clearTimeout(t);
  }, [active, data, moneyFlow]);

  const present = speaking || pleased || menu;

  // Where Aman sits, and whether it or its line would cover a button there.
  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const anchor = anchorName ? rectOf(document.querySelector(`[data-guide-anchor="${CSS.escape(anchorName)}"]`)) : null;
      const line = lineRef.current;
      const lineSize = speaking && line ? { width: Math.max(line.scrollWidth, 280), height: line.offsetHeight } : speaking ? { width: 300, height: 96 } : null;
      const next = placeAman({ viewport: { width: window.innerWidth, height: window.innerHeight }, anchor, bottomBar: bottomBarHeight(), rtl, lineSize });
      // Held still while typing, scrolling fast or reading a dialog; placed again after.
      setPlace((prev) => (prev && hold && Boolean(prev.line) === Boolean(next.line) ? prev : next));
      const own = (hit: Element) => !!(faceRef.current?.contains(hit) || lineRef.current?.contains(hit));
      const at = (x: number, y: number) => document.elementsFromPoint(x, y);
      setLineCovering(line ? coversControl(line.getBoundingClientRect(), at, own) : false);
      setFaceCovering(faceRef.current ? coversControl(faceRef.current.getBoundingClientRect(), at, own) : false);
    };
    const later = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
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
  }, [active, speaking, anchorName, rtl, hold, pathname]);

  const remember = useCallback((next: Visit) => {
    setVisit(next);
    try { writeVisit(sessionStorage, next); } catch { /* no storage */ }
  }, []);

  const open = useCallback(() => openAssistant(pathname, (href) => router.push(href)), [pathname, router]);

  if (!active || !place) return null;
  const from = enterFrom(rtl, reduce);

  const lineFor = (n: Nudge): string => {
    const amount = n.amountUsdc ? money.price(n.amountUsdc, n.agreedLocal ?? null) : '';
    if (n.kind === 'setup_step') return n.step ? moveCopy.setup[n.step].line : '';
    let template = moveCopy.moves[n.kind].line;
    if (n.kind === 'deliver_soon' && n.days === 1) template = moveCopy.deliverSoonOne;
    if (n.kind === 'choose_offer' && n.count === 1) template = moveCopy.chooseOfferOne;
    const num = (v: number | undefined) => (v === undefined ? '' : new Intl.NumberFormat(locale).format(v));
    return template.replace('{amount}', amount).replace('{days}', num(n.days)).replace('{count}', num(n.count));
  };

  const centre = { x: place.face.x + FACE / 2, y: place.face.y + FACE / 2 };
  const anchorBox = anchorName ? rectOf(document.querySelector(`[data-guide-anchor="${CSS.escape(anchorName)}"]`)) : null;
  const gaze = reduce
    ? undefined
    : anchorBox
      ? gazeAt(centre, { x: anchorBox.left + anchorBox.width / 2, y: anchorBox.top + anchorBox.height / 2 })
      : !speaking && pointer
        ? gazeAt(centre, pointer)
        : undefined;
  const actionFor = (n: Nudge): string =>
    n.kind === 'setup_step'
      ? n.step === 'first_deal' && n.href.startsWith('/request')
        ? moveCopy.firstDealOwnAction
        : n.step ? moveCopy.setup[n.step].action : ''
      : moveCopy.moves[n.kind].action;
  const mood: AmanMood = pleased && !speaking ? 'pleased' : speaking ? 'talking' : 'waiting';
  const transition = { duration: reduce || !moving ? 0 : MOVE_S, ease: ease.out };

  const startHold = () => {
    heldOpened.current = false;
    held.current = window.setTimeout(() => { heldOpened.current = true; setMenu(true); }, HOLD_MS);
  };
  const endHold = () => { if (held.current) window.clearTimeout(held.current); held.current = null; };

  return (
    <>
      <AnimatePresence>
        {speaking && nudge && place.line ? (
          <m.div
            key={nudge.key}
            ref={lineRef}
            role="complementary"
            aria-label={copy.label}
            aria-hidden={lineCovering || faceCovering || undefined}
            data-aman-line={nudge.kind}
            data-aside={lineCovering || faceCovering ? '' : undefined}
            initial={{ opacity: 0, x: from.x }}
            animate={{ opacity: 1, x: 0, left: place.line.x, top: place.line.y }}
            exit={{ opacity: 0, x: from.x }}
            transition={{ opacity: { duration: reduce ? dur.micro : ENTER_S, ease: ease.out }, x: { duration: ENTER_S, ease: ease.out }, left: transition, top: transition }}
            style={{ maxWidth: place.line.maxWidth }}
            className="fixed z-50 w-max rounded-[22px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-4 pb-3.5 pt-3 text-[var(--ink)] shadow-[0_14px_36px_-16px_rgba(0,0,0,0.4)] data-[aside]:invisible"
          >
            <p className="guide-voice text-[13px] font-bold leading-none opacity-70">{copy.label}</p>
            <p role="status" className="guide-voice mt-1.5 text-[16px] font-semibold leading-[1.3]">{lineFor(nudge)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={nudge.href}
                onClick={() => remember(afterNotNow(visit, pathname))}
                className="inline-flex min-h-10 items-center rounded-full bg-[var(--action)] px-4 text-[15px] font-bold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--soft-green)]"
              >
                {actionFor(nudge)}
              </Link>
              <button
                type="button"
                onClick={() => remember(afterNotNow(visit, pathname))}
                className="inline-flex min-h-10 items-center rounded-full px-3 text-[15px] font-semibold opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              >
                {copy.notNow}
              </button>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {present ? (
        <m.button
          key="aman"
          ref={faceRef}
          type="button"
          aria-label={copy.open}
          aria-haspopup="menu"
          aria-expanded={menu}
          data-aman-face={mood}
          data-aside={faceCovering ? '' : undefined}
          initial={{ opacity: 0, x: from.x, left: place.face.x, top: place.face.y }}
          animate={{ opacity: 1, x: 0, left: place.face.x, top: place.face.y }}
          exit={{ opacity: 0, x: from.x }}
          transition={{ opacity: { duration: reduce ? dur.micro : ENTER_S, ease: ease.out }, x: { duration: ENTER_S, ease: ease.out }, left: transition, top: transition }}
          onClick={(e) => {
            if (heldOpened.current) { heldOpened.current = false; e.preventDefault(); return; }
            open();
          }}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onContextMenu={(e) => { e.preventDefault(); endHold(); setMenu(true); }}
          onKeyDown={(e) => { if (e.shiftKey && e.key === 'F10') { e.preventDefault(); setMenu(true); } }}
          style={{ width: FACE, height: FACE }}
          className="fixed z-50 grid touch-none select-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 data-[aside]:pointer-events-none data-[aside]:opacity-0 motion-safe:transition-opacity"
        >
          <AmanFace size={56} mood={mood} gaze={gaze} blink={blink} label={null} />
        </m.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {menu ? (
          <AmanMenu
            copy={copy}
            face={place.face}
            rtl={rtl}
            reduce={reduce}
            onAsk={open}
            onQuiet={() => remember(afterQuietHere(visit, pathname))}
            onHide={() => void setGuide('face')}
            onClose={() => { setMenu(false); faceRef.current?.focus(); }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
