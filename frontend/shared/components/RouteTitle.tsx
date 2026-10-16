'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { documentTitle, routeTitleKey, SITE_TITLE } from '@/shared/seo/routeTitle';

/// Names each page in the tab, the history and to screen readers, in the
/// reader's language. The layout ships statically, so this runs in the browser.
///
/// Setting the title once on navigation was not enough: Next applies the
/// layout's own title after the page mounts, and on some routes that write
/// landed last, so the tab kept the generic site name. Watching the head and
/// putting the page's name back whenever something else replaces it keeps it.
export function RouteTitle() {
  const pathname = usePathname() ?? '/';
  const titles = useTranslations().routeTitles;
  useEffect(() => {
    const key = routeTitleKey(pathname);
    if (key === 'server') return;
    const wanted = key ? documentTitle(titles[key]) : SITE_TITLE;
    const hold = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    hold();
    const observer = new MutationObserver(hold);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, titles]);
  return null;
}
