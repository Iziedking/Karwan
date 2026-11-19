'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserSettings } from '@/core/api';
import { pointLines, type PointId } from '@/shared/i18n/messages/pointLines';
import { afterCame, afterNotNow, mayCome, readPace, writePace } from '@/features/guide/amanPace';
import { countVisit, mergeCounts, mergeHeard, pageKey, readSeenAt, visitOffer, writeSeenAt, type VisitOffer } from '@/features/guide/partPace';
import { BETWEEN_LINES_MS, DWELL_MS, HEARD_AFTER_MS, LINES_PER_VISIT, partOrder, pickPart, type PartBox } from '@/features/guide/pickPart';
import { isPoint } from './point';

/// Aman guides you (view 57, 19 Nov): one part of the page at a time, the
/// part the person stops on, each part once, one or two lines a visit, on
/// visits 1, 2, 4 and 8 to a page; the first hello once; a check-in now and
/// then for someone who knows Karwan. The words come from our copy; this only
/// decides what shows and when, and keeps the counts on the account.

export const LINE_MS = 8000;
export const LINE_BUTTONS_MS = 10_000;
export const SWITCHED_OFF_MS = 5000;
const SAVE_EVERY_MS = 60_000;

export type PartLineKind = 'part' | 'hello' | 'check-in' | 'switched-off';
export interface PartLineState { kind: PartLineKind; id?: PointId; el?: HTMLElement; ms: number }
export type EndHow = 'timeout' | 'tap' | 'button' | 'gone';

const storage = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

function hiddenPart(el: HTMLElement, rect: DOMRect): boolean {
  if (rect.width === 0 || rect.height === 0) return true;
  if (el.closest('[aria-hidden="true"],[inert]')) return true;
  const style = getComputedStyle(el);
  return style.visibility === 'hidden' || style.display === 'none';
}

function partsOnPage(): Array<PartBox & { el: HTMLElement }> {
  const seen = new Set<string>();
  const out: Array<PartBox & { el: HTMLElement }> = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-guide]')) {
    const id = el.dataset.guide ?? '';
    if (!isPoint(id) || seen.has(id)) continue;
    const r = el.getBoundingClientRect();
    const hidden = hiddenPart(el, r);
    if (hidden) continue;
    seen.add(id);
    out.push({ id, el, order: partOrder(id), hidden, rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
  }
  return out;
}

export function usePartGuide(a: {
  /// Signed in, on a guided page, settings read: visits are counted.
  track: boolean;
  /// Help on, nothing more important showing, not typing, no dialog, not money.
  enabled: boolean;
  pathname: string;
  settings: UserSettings | undefined;
  save: (patch: UserSettings) => Promise<void>;
  /// A setup step or another ordinary move is waiting: a check-in gives way.
  nudgeWaiting: boolean;
}): {
  line: PartLineState | null;
  /// This visit still has something to say, so ordinary moves wait.
  wants: boolean;
  end: (how: EndHow) => void;
  switchOff: () => void;
  notNowCheckIn: () => void;
} {
  const { track, enabled, pathname, settings, save, nudgeWaiting } = a;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const loaded = settings !== undefined;

  const counts = useRef<Record<string, number>>({});
  const heard = useRef<string[]>([]);
  const dirty = useRef(false);
  const lastSave = useRef(0);
  const hiShown = useRef(false);
  const visit = useRef({ lines: 0, came: false, lastEnd: 0 });
  // The page this visit was counted for: an effect that runs again without a
  // new page (development double runs, settings arriving) is the same visit.
  const countedFor = useRef<string | null>(null);
  const [offer, setOffer] = useState<VisitOffer | null>(null);
  const [line, setLineState] = useState<PartLineState | null>(null);
  const lineRef = useRef<PartLineState | null>(null);
  const setLine = useCallback((next: PartLineState | null) => { lineRef.current = next; setLineState(next); }, []);

  useEffect(() => {
    if (!settings) return;
    counts.current = mergeCounts(settings.guideVisits, counts.current);
    heard.current = mergeHeard(settings.guideHeard, heard.current);
    if (settings.guideHi === 'done') hiShown.current = true;
  }, [settings]);

  const flush = useCallback((force = false) => {
    if (!dirty.current || !track) return;
    const now = Date.now();
    if (!force && now - lastSave.current < SAVE_EVERY_MS) return;
    dirty.current = false;
    lastSave.current = now;
    const s = settingsRef.current;
    void save({ guideVisits: mergeCounts(s?.guideVisits, counts.current), guideHeard: mergeHeard(s?.guideHeard, heard.current) });
  }, [save, track]);

  useEffect(() => {
    const t = window.setInterval(() => flush(true), SAVE_EVERY_MS);
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    return () => { window.clearInterval(t); window.removeEventListener('pagehide', onHide); };
  }, [flush]);

  const markHeard = useCallback((id: string | undefined) => {
    if (!id || heard.current.includes(id)) return;
    heard.current = mergeHeard(heard.current, [id]);
    dirty.current = true;
    // A part heard is rare (two a visit at most): keep it on the account at once.
    flush(true);
  }, [flush]);

  const end = useCallback((how: EndHow) => {
    const cur = lineRef.current;
    if (!cur) return;
    if (cur.kind === 'part' && how !== 'timeout' && how !== 'gone') markHeard(cur.id);
    visit.current.lastEnd = Date.now();
    setLine(null);
    if (cur.kind !== 'part' || visit.current.lines >= LINES_PER_VISIT) setOffer(null);
  }, [markHeard, setLine]);

  // Each page opened counts as a visit when it has not been counted in the last half hour.
  useEffect(() => {
    if (!track || !loaded) { setOffer(null); return; }
    // The same page again without a navigation (a development double run,
    // settings arriving) is the same visit: nothing is counted or offered twice.
    if (countedFor.current === pathname) return;
    if (lineRef.current?.kind !== 'switched-off') setLine(null);
    visit.current = { lines: 0, came: false, lastEnd: 0 };
    const key = pageKey(pathname);
    const now = Date.now();
    const r = countVisit({ counts: counts.current, seenAt: readSeenAt(storage()), key, now });
    countedFor.current = pathname;
    if (r.counted) {
      counts.current = r.counts;
      dirty.current = true;
      writeSeenAt(storage(), r.seenAt);
    }
    const s = settingsRef.current;
    const next = visitOffer({ hiDone: hiShown.current || s?.guideHi === 'done', counted: r.counted, visit: r.visit, counts: counts.current, lastCheckInAt: s?.guideCheckInAt, now });
    // Someone who has heard every part has nothing left to be shown.
    const allHeard = Object.keys(pointLines.en).every((id) => heard.current.includes(id));
    setOffer(next === 'parts' && allHeard ? null : next);
  }, [pathname, track, loaded, setLine]);

  // Help switched off, a dialog, typing or something urgent: the line goes.
  useEffect(() => {
    if (!enabled && lineRef.current && lineRef.current.kind !== 'switched-off') end('gone');
  }, [enabled, end]);

  useEffect(() => {
    if (!enabled || !offer || line) return;
    if (offer === 'check-in' && nudgeWaiting) return;
    const v = visit.current;
    if (v.lines >= (offer === 'parts' ? LINES_PER_VISIT : 1)) return;
    const paceOk = () => v.came || mayCome(readPace(storage()), Date.now(), false);
    const take = () => {
      if (!v.came) {
        v.came = true;
        writePace(storage(), afterCame(readPace(storage()), Date.now()));
      }
      v.lines += 1;
    };
    if (offer === 'hello' || offer === 'check-in') {
      const top = document.querySelector<HTMLElement>('main');
      if (!top || !paceOk()) return;
      take();
      if (offer === 'hello') { hiShown.current = true; void save({ guideHi: 'done' }); }
      else void save({ guideCheckInAt: Date.now() });
      setLine({ kind: offer, el: top, ms: LINE_BUTTONS_MS });
      return;
    }
    let timer = 0;
    const fire = () => {
      if (!paceOk()) return;
      const parts = partsOnPage();
      const unheard = new Set(heard.current);
      if (!parts.some((p) => !unheard.has(p.id))) { setOffer(null); return; }
      const id = pickPart({ parts, heard: unheard, viewport: { width: window.innerWidth, height: window.innerHeight } });
      const part = id ? parts.find((p) => p.id === id) : undefined;
      if (!part || !isPoint(part.id)) return;
      take();
      setLine({ kind: 'part', id: part.id, el: part.el, ms: LINE_MS });
    };
    // Waits for the person to stop: the dwell starts again at every scroll.
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, Math.max(DWELL_MS, v.lastEnd + BETWEEN_LINES_MS - Date.now()));
    };
    arm();
    window.addEventListener('scroll', arm, { passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener('scroll', arm); };
  }, [enabled, offer, line, nudgeWaiting, save, setLine]);

  // A line goes after its time, at a tap anywhere outside it, or on Escape.
  useEffect(() => {
    if (!line) return;
    const since = performance.now();
    const timer = window.setTimeout(() => end('timeout'), line.ms);
    const heardTimer = line.kind === 'part' ? window.setTimeout(() => markHeard(line.id), HEARD_AFTER_MS) : 0;
    function onDown(e: PointerEvent) {
      if (e.timeStamp < since) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('[data-aman-line],[data-aman-face]')) return;
      end('tap');
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') end('tap'); }
    document.addEventListener('pointerdown', onDown, { capture: true });
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(heardTimer);
      document.removeEventListener('pointerdown', onDown, { capture: true });
      document.removeEventListener('keydown', onKey);
    };
  }, [line, end, markHeard]);

  const switchOff = useCallback(() => {
    void save({ guide: 'face' });
    setOffer(null);
    const top = lineRef.current?.el ?? document.querySelector<HTMLElement>('main') ?? undefined;
    setLine({ kind: 'switched-off', el: top, ms: SWITCHED_OFF_MS });
  }, [save, setLine]);

  const notNowCheckIn = useCallback(() => {
    writePace(storage(), afterNotNow(readPace(storage()), Date.now()));
    end('button');
  }, [end]);

  const wants = offer !== null && offer !== 'check-in';
  return { line, wants, end, switchOff, notNowCheckIn };
}
