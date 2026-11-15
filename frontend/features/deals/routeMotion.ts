import { useEffect, useMemo, useRef } from 'react';
import type { RouteMark } from './dealRouteModel';

/// How the route moves (view 48, owner 15 Nov 2026). On first paint the
/// reached stops come in one after another; once a track is on screen, only a
/// stop that was newly reached moves. The drawing itself is CSS (globals.css,
/// "Deal route motion"), which also switches it all off for reduced motion.

export const ROUTE_STEP_MS = 180;

export interface StopMotion {
  enter: boolean;
  delayMs: number;
}

export function routeMotion(prev: readonly RouteMark[] | null, next: readonly RouteMark[]): StopMotion[] {
  const first = !prev || prev.length !== next.length;
  let order = 0;
  return next.map((mark, i) => {
    const reached = mark !== 'next';
    const enter = reached && (first || prev[i] !== mark);
    return enter ? { enter, delayMs: ROUTE_STEP_MS * order++ } : { enter: false, delayMs: 0 };
  });
}

/// The motion for a mounted track: remembers what it last drew, so a re-render
/// with the same stops moves nothing.
export function useRouteMotion(marks: readonly RouteMark[]): StopMotion[] {
  const drawn = useRef<RouteMark[] | null>(null);
  const key = marks.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for the marks
  const motion = useMemo(() => routeMotion(drawn.current, marks), [key]);
  useEffect(() => {
    drawn.current = [...marks];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for the marks
  }, [key]);
  return motion;
}
