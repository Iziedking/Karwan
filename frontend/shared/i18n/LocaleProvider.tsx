'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, isLocale, isRtl, type Locale } from './locales';
import { MESSAGES, type Messages } from './messages';

const LOCALE_COOKIE = 'karwan-locale';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Messages;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readCookieLocale(): Locale | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${LOCALE_COOKIE}=`));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice(LOCALE_COOKIE.length + 1));
  return isLocale(value) ? value : null;
}

function writeCookieLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);

  // After hydration, prefer the cookie value (covers the case where the
  // server-rendered default was English but the client has a saved preference).
  useEffect(() => {
    const cookieLocale = readCookieLocale();
    if (cookieLocale && cookieLocale !== locale) {
      setLocaleState(cookieLocale);
    }
    // Intentionally only on mount; subsequent changes go through setLocale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /// Reflect locale on <html lang> and flip <html dir> for RTL locales. The
  /// v2.H audit pass migrated directional Tailwind utilities to logical
  /// equivalents (ms-/me-/ps-/pe-/text-start/text-end/start-/end-/border-s/
  /// border-e) across app/, features/, and shared/, so the layout mirrors
  /// cleanly under dir="rtl". Intentional brand asymmetric corners (Karwan's
  /// 14/14/14/4 and 28/28/28/6 grammar) stay physical via inline styles, so
  /// the small notch remains in its design-canonical spot in either
  /// direction.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeCookieLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: MESSAGES[locale] }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback rather than throw, so any component used in a test or storybook
    // without the provider still renders English copy instead of crashing.
    return { locale: DEFAULT_LOCALE, setLocale: () => {}, t: MESSAGES[DEFAULT_LOCALE] };
  }
  return ctx;
}

export function useTranslations(): Messages {
  return useLocale().t;
}
