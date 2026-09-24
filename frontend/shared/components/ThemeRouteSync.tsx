'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { applyTheme, readPreference, themeForRoute } from '@/shared/hooks/useTheme';

/// The pre-paint script only runs on a full page load. A client-side navigation
/// onto or off the landing page repaints here, so a visitor who chose light
/// elsewhere still meets the landing page in dark, and gets light back when they
/// leave it. Reads the stored preference and never writes it. Mounted once in
/// the root layout.
export function ThemeRouteSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyTheme(themeForRoute(pathname, readPreference()));
  }, [pathname]);
  return null;
}
