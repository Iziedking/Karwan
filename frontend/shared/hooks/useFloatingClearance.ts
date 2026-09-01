'use client';
import { useEffect, useState } from 'react';

export type FloatingSide = 'start' | 'end';

/// The two launchers sit in fixed logical corners above the mobile task bar.
/// Their old guard only knew about pages that had been manually tagged, which
/// meant an untagged title, amount or button could still be covered. This hook
/// measures the footprint of one launcher and asks what is actually underneath
/// it. Meaningful copy, media, controls and explicit protected zones make that
/// launcher fold away; genuine blank card space does not.
const MOBILE_MAX = 768;
const MOBILE_INLINE_INSET = 16;
const MOBILE_BOTTOM_INSET = 96;
const MOBILE_LAUNCHER_SIZE = 44;

const CONTROL_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
].join(',');

const READING_TAGS = new Set([
  'P',
  'SPAN',
  'LI',
  'DT',
  'DD',
  'H1',
  'H2',
  'H3',
  'H4',
  'IMG',
  'VIDEO',
  'CANVAS',
]);

function isInsideLauncherOrNav(element: Element): boolean {
  return Boolean(
    element.closest('[data-float-launcher]') ||
      element.closest('[data-workspace-bottom-nav]'),
  );
}

function containsReadableInk(element: Element): boolean {
  if (!READING_TAGS.has(element.tagName)) return false;
  if (element.tagName === 'IMG' || element.tagName === 'VIDEO' || element.tagName === 'CANVAS') {
    return true;
  }
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
}

function pointBlocksLauncher(x: number, y: number): boolean {
  if (typeof document.elementsFromPoint !== 'function') return false;
  const stack = document.elementsFromPoint(x, y);
  for (const element of stack) {
    if (isInsideLauncherOrNav(element)) continue;
    if (element === document.documentElement || element === document.body) continue;
    if (element.closest('[data-floating-avoid], [data-float-guard]')) return true;
    if (element.matches(CONTROL_SELECTOR) || element.closest(CONTROL_SELECTOR)) return true;
    if (containsReadableInk(element)) return true;
  }
  return false;
}

function intendedRect(side: FloatingSide): DOMRect {
  const rtl = document.documentElement.dir === 'rtl';
  const physicalLeft = side === 'start' ? !rtl : rtl;
  const left = physicalLeft
    ? MOBILE_INLINE_INSET
    : window.innerWidth - MOBILE_INLINE_INSET - MOBILE_LAUNCHER_SIZE;
  const top = window.innerHeight - MOBILE_BOTTOM_INSET - MOBILE_LAUNCHER_SIZE;
  return new DOMRect(left, top, MOBILE_LAUNCHER_SIZE, MOBILE_LAUNCHER_SIZE);
}

function footprintIsBlocked(side: FloatingSide): boolean {
  const rect = intendedRect(side);
  // Insets keep border anti-aliasing from reporting a neighbouring rule as a
  // collision. Centre plus eight interior points catch copy and controls even
  // when only one corner of the launcher would cover them.
  const inset = 5;
  const x = [rect.left + inset, rect.left + rect.width / 2, rect.right - inset];
  const y = [rect.top + inset, rect.top + rect.height / 2, rect.bottom - inset];
  return x.some((px) => y.some((py) => pointBlocksLauncher(px, py)));
}

export function useFloatingClearance(side: FloatingSide): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    let alive = true;

    const measure = () => {
      frame = 0;
      if (!alive) return;
      const next = window.innerWidth < MOBILE_MAX && footprintIsBlocked(side);
      setBlocked((current) => (current === next ? current : next));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    // Data, localization and deck changes can move content under a stationary
    // launcher. Observe both DOM changes and document reflow, but collapse all
    // resulting work to one animation frame.
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true, characterData: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resize?.observe(document.body);

    return () => {
      alive = false;
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      mutation.disconnect();
      resize?.disconnect();
    };
  }, [side]);

  return blocked;
}

/// Translate and scale rather than display:none so the pair leaves smoothly.
/// Pointer events are removed immediately: an invisible launcher must never
/// swallow the press meant for the content beneath it.
export function floatingClearanceStyle(blocked: boolean): React.CSSProperties {
  return {
    transform: blocked ? 'translateY(140%) scale(0.85)' : 'translateY(0) scale(1)',
    opacity: blocked ? 0 : 1,
    visibility: blocked ? 'hidden' : 'visible',
    pointerEvents: blocked ? 'none' : undefined,
    transition:
      'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out, visibility 260ms',
  };
}
