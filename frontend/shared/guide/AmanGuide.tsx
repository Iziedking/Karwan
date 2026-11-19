'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { anchorFor, helloDue, moodFor, pickNudge, stepFinished, type Nudge, type SetupKey } from '@/features/guide/pickNudge';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useNewcomer } from './useNewcomer';
import { NEW_HERE_QUESTIONS, NEW_HERE_SEEN, newHereFits, newHereOff, newHerePage } from './newHere';
import { carryAsk } from '@/features/assistant/carriedAsk';
import { coversControl } from '@/features/guide/coversControl';
import { FACE, placeAman, type Placement, type Rect } from '@/features/guide/placeAman';
import { ENTER_S, FAST_SCROLL, PLEASED_MS, enterFrom, isMoneyFlow, mayMove, maySpeak } from '@/features/guide/amanMotion';
import { afterNotNow, afterQuietHere, emptyVisit, hiddenNow, isQuiet, readVisit, writeVisit, type Visit } from '@/features/guide/guideChoices';
import { useGuideSetting } from '@/features/guide/useGuideSetting';
import { openAssistant } from '@/shared/assistant/openAssistant';
import { useAssistantShortcut } from '@/shared/assistant/useAssistantShortcut';
import type { AmanMood } from '@/features/guide/amanDots';
import { AmanFace } from './AmanFace';
import { useAmanLife } from './useAmanLife';
import { AmanMenu } from './AmanMenu';
import { afterCame, afterNotNow as paceAfterNotNow, mayCome, readPace, writePace } from '@/features/guide/amanPace';
import { pointLines, type PointId } from '@/shared/i18n/messages/pointLines';
import { POINT_MS, isPoint, pointFromUrl, withoutPoint } from './point';
import { PointRing } from './PointRing';

const SHOW_AFTER_MS = 1200;
const HELLO_MS = 2400;
const HOLD_MS = 500;
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

function shownPart(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-guide="${CSS.escape(id)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

const FIND_MS = 3000;

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
  const searchParams = useSearchParams();
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = guideCopy[locale];
  const moveCopy = nextMoveCopy[locale];
  const money = useMoneyText();
  const reduce = useHydratedReducedMotion();
  const { guide, loaded, set: setGuide, settings, save: saveSettings } = useGuideSetting();
  const { profile } = useUserProfile();
  const who = useNewcomer();
  const [offerDone, setOfferDone] = useState(false);
  const [seenHere, setSeenHere] = useState(false);

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
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [rtl, setRtl] = useState(false);
  const [pleased, setPleased] = useState(false);
  const [hello, setHello] = useState(false);
  const [closedMoments, setClosedMoments] = useState<ReadonlySet<string>>(() => new Set());
  const marked = useRef(new Set<string>());
  const spokenStep = useRef<SetupKey | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const faceRef = useRef<HTMLButtonElement | null>(null);
  const held = useRef<number | null>(null);
  const heldOpened = useRef(false);

  const active = signedIn && !quiet && loaded && guide === 'on';

  // Show me (view 57, 17 Nov): ?point=<id> lights that part for 8 s or until a
  // tap, with our own line beside it. The person asked, so pace and the guide
  // setting do not hold it back.
  const [pointId, setPointId] = useState<PointId | null>(null);
  const [pointing, setPointing] = useState<{ id: PointId; rect: Rect; radius: number } | null>(null);
  const pointEl = useRef<HTMLElement | null>(null);
  const search = searchParams?.toString() ?? '';
  // One light per link: until the point leaves the address, a re-render must
  // not light it again after a tap has put it out.
  const pointTaken = useRef<string | null>(null);
  useEffect(() => {
    const id = pointFromUrl(search);
    if (!id) { pointTaken.current = null; return; }
    router.replace(`${pathname}${withoutPoint(search)}`, { scroll: false });
    if (quiet || !isPoint(id) || pointTaken.current === search) return;
    pointTaken.current = search;
    setPointId(id);
  }, [search, pathname, quiet, router]);
  // Read, not watched: the motion setting settling after load must not restart
  // the light and drop the tap that puts it out.
  const reduceNow = useRef(reduce);
  reduceNow.current = reduce;
  useEffect(() => {
    if (!pointId) return;
    const started = Date.now();
    let looking = 0;
    let lit = 0;
    let since = Infinity;
    const clear = () => {
      document.removeEventListener('pointerdown', onTap, { capture: true });
      pointEl.current = null;
      setPointing(null);
      setPointId(null);
    };
    // Listening from the moment the light is set, before it paints, so a quick
    // tap is never lost; only the press that opened the link is too early.
    function onTap(e: PointerEvent) { if (e.timeStamp >= since) clear(); }
    const find = () => {
      const el = shownPart(pointId);
      if (!el) {
        if (Date.now() - started < FIND_MS) looking = window.setTimeout(find, 150);
        else setPointId(null);
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: reduceNow.current ? 'auto' : 'smooth' });
      pointEl.current = el;
      setPointing({ id: pointId, rect: rectOf(el)!, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12 });
      since = performance.now();
      document.addEventListener('pointerdown', onTap, { capture: true });
      lit = window.setTimeout(clear, POINT_MS);
    };
    find();
    return () => {
      window.clearTimeout(looking);
      window.clearTimeout(lit);
      document.removeEventListener('pointerdown', onTap, { capture: true });
    };
  }, [pointId]);

  const { data, refetch } = useQuery({
    queryKey: ['guide-next'],
    queryFn: () => api.guideNext(),
    enabled: active,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // The one moment to react to (view 57, 15 Nov evening), read with the moves.
  const { data: momentData, refetch: refetchMoment } = useQuery({
    queryKey: ['guide-moment'],
    queryFn: () => api.guideMoment(),
    enabled: active,
    staleTime: 30_000,
  });

  useEffect(() => {
    try { setVisit(readVisit(sessionStorage)); } catch { /* no storage */ }
    setRtl(document.documentElement.dir === 'rtl');
  }, [locale]);

  // A new page reads the moves again, so a step done on the last page is seen.
  useEffect(() => {
    if (active) { void refetch(); void refetchMoment(); }
  }, [pathname, active, refetch, refetchMoment]);

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

  // Blink and breath come from the one clock every face shares (view 57, 15 Nov evening).
  const { blink } = useAmanLife(faceRef, { look: null, seed: pathname });

  const nudge = useMemo<Nudge | null>(
    () => (data && Array.isArray(data.moves) ? pickNudge({ moves: data.moves, pathname, closed: closedMoments, moment: momentData?.moment ?? null }) : null),
    [data, pathname, closedMoments, momentData],
  );

  const moneyFlow = isMoneyFlow(pathname);
  const urgent = !!nudge && (nudge.kind === 'moment' || moodFor(nudge) === 'waiting');
  // New here? (view 57, 17 Nov): someone new is answered, not walked through.
  const herePage = newHerePage(pathname);
  // Asking one question on a page leaves the next page free to ask again.
  useEffect(() => { setOfferDone(false); }, [pathname]);
  useEffect(() => {
    try { setSeenHere(herePage ? sessionStorage.getItem(NEW_HERE_SEEN(herePage)) === '1' : false); } catch { setSeenHere(false); }
  }, [herePage]);
  const offerFits = newHereFits({ newcomer: who === 'new', pathname, off: newHereOff(settings), urgent, seen: seenHere });
  // One pace for the whole site: may Aman start something new here? Read
  // once per page, so a line already showing is never cut off.
  const [paceOpen, setPaceOpen] = useState(false);
  const [offerStarted, setOfferStarted] = useState(false);
  useEffect(() => {
    setOfferStarted(false);
    if (!ready) return;
    try { setPaceOpen(mayCome(readPace(window.localStorage), Date.now(), urgent)); } catch { setPaceOpen(true); }
  }, [pathname, ready, urgent]);
  const offering = !pointing && active && ready && offerFits && !offerDone && !typing && !dialog && !moneyFlow && !isQuiet(visit, pathname) && (offerStarted || paceOpen);
  const speaking =
    !pointing &&
    !offering &&
    active &&
    ready &&
    nudge !== null &&
    (spokenKey === nudge.key || paceOpen) &&
    !hiddenNow(visit, pathname, false) &&
    maySpeak({ typing, dialogOpen: dialog, moneyFlow, spokenThisVisit: spokenKey !== null && spokenKey !== nudge.key, quietHere: isQuiet(visit, pathname), guide });
  const moving = mayMove({ typing, fastScroll, dialogOpen: dialog, moneyFlow, reducedMotion: reduce });
  const anchorName = speaking && nudge && !reduce ? anchorFor(nudge) : null;
  const hold = typing || fastScroll || dialog;

  useEffect(() => {
    if (!offering || offerStarted) return;
    setOfferStarted(true);
    try { if (herePage) sessionStorage.setItem(NEW_HERE_SEEN(herePage), '1'); } catch { /* no storage */ }
    setPaceOpen(false);
    try { writePace(window.localStorage, afterCame(readPace(window.localStorage), Date.now())); } catch { /* no storage */ }
  }, [offering, offerStarted]);

  useEffect(() => {
    if (!speaking || !nudge) return;
    if (spokenKey !== nudge.key) {
      setPaceOpen(false);
      try { writePace(window.localStorage, afterCame(readPace(window.localStorage), Date.now())); } catch { /* no storage */ }
    }
    setSpokenKey(nudge.key);
    spokenStep.current = nudge.kind === 'setup_step' ? nudge.step ?? null : null;
    // Said once: a moment is marked shown for every device, and a setup step counts as today's ask.
    if (marked.current.has(nudge.key)) return;
    marked.current.add(nudge.key);
    if (nudge.kind === 'moment' && nudge.moment) void api.guideMomentSeen(nudge.moment.id).catch(() => undefined);
    if (nudge.kind === 'setup_step' && nudge.step) void api.guideAsked(nudge.step).catch(() => undefined);
  }, [speaking, nudge]);

  // The day's hello on Home, when there is nothing else to say (view 57, 15 Nov evening).
  const today = useMemo(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }, []);
  useEffect(() => {
    if (!active || !ready || nudge || offerFits || !settings || reduce === undefined) return;
    if (!helloDue(settings.guideHelloOn, today, pathname)) return;
    setHello(true);
    void saveSettings({ guideHelloOn: today });
    const t = window.setTimeout(() => setHello(false), HELLO_MS);
    return () => window.clearTimeout(t);
  }, [active, ready, nudge, offerFits, settings, today, pathname, saveSettings, reduce]);

  // The step Aman named is done: pleased for a moment, then gone (view 57, 15 Nov).
  useEffect(() => {
    if (!active || !data || !Array.isArray(data.moves) || moneyFlow) return;
    if (!stepFinished(spokenStep.current, data.moves)) return;
    spokenStep.current = null;
    setPleased(true);
    const t = window.setTimeout(() => setPleased(false), PLEASED_MS);
    return () => window.clearTimeout(t);
  }, [active, data, moneyFlow]);

  const helloing = hello && !speaking && !offering && !pointing;
  const present = speaking || pleased || menu || helloing || offering || !!pointing;

  // Where Aman sits, and whether it or its line would cover a button there.
  useLayoutEffect(() => {
    if (!active && !pointing) return;
    let frame = 0;
    // A line that grows after it shows (a late font, a longer wrap) adds nothing to the page, so watch its size too.
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => later());
    let watched: Element | null = null;
    const measure = () => {
      frame = 0;
      const part = pointEl.current ? rectOf(pointEl.current) : null;
      if (part) setPointing((prev) => (prev && (prev.rect.left !== part.left || prev.rect.top !== part.top || prev.rect.width !== part.width || prev.rect.height !== part.height) ? { ...prev, rect: part } : prev));
      const anchor = part ?? (anchorName ? rectOf(document.querySelector(`[data-guide-anchor="${CSS.escape(anchorName)}"]`)) : null);
      const line = lineRef.current;
      if (sizes && line !== watched) {
        if (watched) sizes.unobserve(watched);
        if (line) sizes.observe(line);
        watched = line;
      }
      const talking = speaking || helloing || offering || !!pointEl.current;
      const lineSize = talking && line ? { width: Math.max(line.scrollWidth, 280), height: line.scrollHeight } : speaking || offering || pointEl.current ? { width: 300, height: 96 } : helloing ? { width: 240, height: 56 } : null;
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
      sizes?.disconnect();
      window.removeEventListener('scroll', later, { capture: true });
      window.removeEventListener('resize', later);
      observer.disconnect();
    };
  }, [active, speaking, helloing, offering, anchorName, rtl, hold, pathname, pointing?.id]);

  const remember = useCallback((next: Visit) => {
    setVisit(next);
    try { writeVisit(sessionStorage, next); } catch { /* no storage */ }
  }, []);

  const open = useCallback(() => openAssistant(pathname, (href) => router.push(href)), [pathname, router]);

  if (!(active || pointing) || !place) return null;
  const from = enterFrom(rtl, reduce);

  const lineFor = (n: Nudge): string => {
    const amount = n.amountUsdc ? money.price(n.amountUsdc, n.agreedLocal ?? null) : '';
    if (n.kind === 'moment') return n.moment ? copy.moments[n.moment.line].line.replace('{amount}', amount) : '';
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
    : pointing
      ? gazeAt(centre, { x: pointing.rect.left + pointing.rect.width / 2, y: pointing.rect.top + pointing.rect.height / 2 })
      : anchorBox
      ? gazeAt(centre, { x: anchorBox.left + anchorBox.width / 2, y: anchorBox.top + anchorBox.height / 2 })
      : !speaking && pointer
        ? gazeAt(centre, pointer)
        : undefined;
  const actionFor = (n: Nudge): string =>
    n.kind === 'moment'
      ? n.moment ? copy.moments[n.moment.line].action : ''
      : n.kind === 'setup_step'
      ? n.step === 'first_deal' && n.href.startsWith('/request')
        ? moveCopy.firstDealOwnAction
        : n.step ? moveCopy.setup[n.step].action : ''
      : moveCopy.moves[n.kind].action;
  const mood: AmanMood = pointing ? 'talking' : pleased && !speaking ? 'pleased' : speaking && nudge ? moodFor(nudge) : helloing || offering ? 'excited' : 'waiting';
  const askHere = (question: string) => {
    setOfferDone(true);
    carryAsk(question);
    openAssistant(pathname, (href) => router.push(href));
  };
  // Not now on New here turns it off on every page and every device.
  const declineNewHere = () => {
    setOfferDone(true);
    void saveSettings({ guideNewHere: 'off' });
    try { writePace(window.localStorage, paceAfterNotNow(readPace(window.localStorage), Date.now())); } catch { /* no storage */ }
  };
  const name = profile?.handle ? `@${profile.handle}` : (profile?.displayName ?? '').trim().split(/\s+/)[0] ?? '';
  const helloLine = name ? copy.hello.replace('{name}', name) : copy.hello.replace(/,?\s*\{name\}/, '');
  // Not now: a moment stays down for the visit; a setup step is held on the account for days.
  const notNow = (n: Nudge) => {
    remember(afterNotNow(visit, pathname));
    try { writePace(window.localStorage, paceAfterNotNow(readPace(window.localStorage), Date.now())); } catch { /* no storage */ }
    if (n.kind === 'moment') setClosedMoments((prev) => new Set(prev).add(n.key));
    if (n.kind === 'setup_step' && n.step) void api.guideSnooze(n.step).catch(() => undefined);
  };
  const transition = { duration: reduce || !moving ? 0 : MOVE_S, ease: ease.out };

  const startHold = () => {
    heldOpened.current = false;
    held.current = window.setTimeout(() => { heldOpened.current = true; setMenu(true); }, HOLD_MS);
  };
  const endHold = () => { if (held.current) window.clearTimeout(held.current); held.current = null; };

  return (
    <>
      {pointing ? <PointRing rect={pointing.rect} radius={pointing.radius} /> : null}
      <AnimatePresence>
        {pointing && place.line ? (
          <m.div
            key={`point-${pointing.id}`}
            ref={lineRef}
            role="status"
            data-aman-line="point"
            initial={{ opacity: 0, x: from.x }}
            animate={{ opacity: 1, x: 0, left: place.line.x, top: place.line.y }}
            exit={{ opacity: 0, x: from.x }}
            transition={{ opacity: { duration: reduce ? dur.micro : ENTER_S, ease: ease.out }, x: { duration: ENTER_S, ease: ease.out }, left: transition, top: transition }}
            style={{ maxWidth: place.line.maxWidth, maxHeight: place.line.maxHeight, overflowY: 'auto' }}
            className="fixed z-50 w-max rounded-[22px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-4 py-3 text-[var(--ink)] shadow-[0_14px_36px_-16px_rgba(0,0,0,0.4)]"
          >
            <p className="guide-voice text-[13px] font-bold leading-none opacity-70">{copy.label}</p>
            <p className="guide-voice mt-1.5 text-[16px] font-semibold leading-[1.3]">{(pointLines[locale] ?? pointLines.en)[pointing.id]}</p>
          </m.div>
        ) : speaking && nudge && place.line ? (
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
            style={{ maxWidth: place.line.maxWidth, maxHeight: place.line.maxHeight, overflowY: 'auto' }}
            className="fixed z-50 w-max rounded-[22px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-4 pb-3.5 pt-3 text-[var(--ink)] shadow-[0_14px_36px_-16px_rgba(0,0,0,0.4)] data-[aside]:invisible"
          >
            <p className="guide-voice text-[13px] font-bold leading-none opacity-70">{copy.label}</p>
            <p role="status" className="guide-voice mt-1.5 text-[16px] font-semibold leading-[1.3]">{lineFor(nudge)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={nudge.href}
                onClick={() => { remember(afterNotNow(visit, pathname)); if (nudge.kind === 'moment') setClosedMoments((prev) => new Set(prev).add(nudge.key)); }}
                className="inline-flex min-h-10 items-center rounded-full bg-[var(--action)] px-4 text-[15px] font-bold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--soft-green)]"
              >
                {actionFor(nudge)}
              </Link>
              <button
                type="button"
                onClick={() => notNow(nudge)}
                className="inline-flex min-h-10 items-center rounded-full px-3 text-[15px] font-semibold opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              >
                {copy.notNow}
              </button>
            </div>
          </m.div>
        ) : offering && place.line ? (
          <m.div
            key="new-here"
            ref={lineRef}
            role="complementary"
            aria-label={copy.label}
            data-aman-line="new-here"
            aria-hidden={lineCovering || faceCovering || undefined}
            data-aside={lineCovering || faceCovering ? '' : undefined}
            initial={{ opacity: 0, x: from.x }}
            animate={{ opacity: 1, x: 0, left: place.line.x, top: place.line.y }}
            exit={{ opacity: 0, x: from.x }}
            transition={{ opacity: { duration: reduce ? dur.micro : ENTER_S, ease: ease.out }, x: { duration: ENTER_S, ease: ease.out } }}
            style={{ maxWidth: place.line.maxWidth, maxHeight: place.line.maxHeight, overflowY: 'auto' }}
            className="fixed z-50 w-max rounded-[22px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-4 pb-3.5 pt-3 text-[var(--ink)] shadow-[0_14px_36px_-16px_rgba(0,0,0,0.4)] data-[aside]:invisible"
          >
            <p className="guide-voice text-[13px] font-bold leading-none opacity-70">{copy.label}</p>
            <p role="status" className="guide-voice mt-1.5 text-[16px] font-semibold leading-[1.3]">{copy.newHere}</p>
            <div className="mt-3 flex flex-col items-stretch gap-2">
              {herePage ? NEW_HERE_QUESTIONS[herePage].map((key) => (
                <button key={key} type="button" onClick={() => askHere(copy.questions[key])} className="inline-flex min-h-10 items-center rounded-full border border-[var(--soft-green-edge)] bg-[var(--surface)] px-4 text-start text-[15px] font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">{copy.questions[key]}</button>
              )) : null}
              <button type="button" onClick={declineNewHere} className="inline-flex min-h-10 items-center rounded-full px-3 text-[15px] font-semibold opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">{copy.notNow}</button>
            </div>
          </m.div>
        ) : helloing && place.line ? (
          <m.div
            key="hello"
            ref={lineRef}
            role="status"
            data-aman-line="hello"
            initial={{ opacity: 0, x: from.x }}
            animate={{ opacity: 1, x: 0, left: place.line.x, top: place.line.y }}
            exit={{ opacity: 0, x: from.x }}
            transition={{ opacity: { duration: reduce ? dur.micro : ENTER_S, ease: ease.out }, x: { duration: ENTER_S, ease: ease.out } }}
            style={{ maxWidth: place.line.maxWidth, maxHeight: place.line.maxHeight, overflowY: 'auto' }}
            className="fixed z-50 w-max rounded-[22px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-4 py-3 text-[var(--ink)] shadow-[0_14px_36px_-16px_rgba(0,0,0,0.4)]"
          >
            <p className="guide-voice text-[16px] font-semibold leading-[1.3]">{helloLine}</p>
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
