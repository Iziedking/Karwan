'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { documentTitle, routeTitleKey, SITE_TITLE } from '@/shared/seo/routeTitle';

/// Names each page in the tab, the history and to screen readers, in the
/// reader's language. The layout ships statically, so this runs in the browser.
export function RouteTitle() {
  const pathname = usePathname() ?? '/';
  const titles = useTranslations().routeTitles;
  useEffect(() => {
    const key = routeTitleKey(pathname);
    if (key === 'server') return;
    document.title = key ? documentTitle(titles[key]) : SITE_TITLE;
  }, [pathname, titles]);
  return null;
}
