'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { routeMotion, type RouteMotion } from './routeMotion';

/// Set by the browser's back and forward buttons, read by the next route.
let popped = false;

/**
 * The page for one route (view 48). A page opened from another pushes in from
 * the end side, back reverses, a tab fades in; the first page of a visit
 * paints still. CSS only (`.route-stage` in globals.css), so reduced motion
 * turns every arrival into a short fade. Keyed by path so a page's state never
 * carries over to the next one, such as one deal's open sheet onto another deal.
 */
export function RouteStage({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [arrival, setArrival] = useState<{ path: string; motion: RouteMotion }>({ path: pathname, motion: 'none' });
  if (arrival.path !== pathname) {
    setArrival({ path: pathname, motion: routeMotion(arrival.path, pathname, popped) });
    popped = false;
  }

  useEffect(() => {
    const onPop = () => { popped = true; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div key={pathname} className="route-stage min-w-0" data-route-motion={arrival.motion === 'none' ? undefined : arrival.motion}>
      {children}
    </div>
  );
}
