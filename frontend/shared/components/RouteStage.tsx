'use client';

import type { ReactNode } from 'react';

/**
 * The page for one route. A new route paints at full strength straight away:
 * no dim, slide or fake progress rule between pages, which read as the page
 * shading on every click. Keyed by path so a page's state never carries over
 * to the next one, such as one deal's open sheet onto another deal.
 */
export function RouteStage({ pathname, children }: { pathname: string; children: ReactNode }) {
  return (
    <div key={pathname} className="min-w-0">
      {children}
    </div>
  );
}
