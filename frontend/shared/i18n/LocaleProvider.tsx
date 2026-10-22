'use client';
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DEFAULT_LOCALE, isLocale, isRtl, type Locale } from './locales';
import { EN_MESSAGES, loadMessages, type Messages } from './messages';
import { cleanUiMessages } from './uiCopy';

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

/// Cleaning walks the whole message tree, so each language is cleaned once.
const cleaned = new WeakMap<Messages, Messages>();
function clean(messages: Messages): Messages {
  let out = cleaned.get(messages);
  if (!out) {
    out = cleanUiMessages(messages);
    cleaned.set(messages, out);
  }
  return out;
}

/// A reader of another language starts fetching it while the page hydrates,
/// not after the first render.
const cookieAtBoot = readCookieLocale();
const earlyLoad: Partial<Record<Locale, Promise<Messages>>> =
  cookieAtBoot && cookieAtBoot !== 'en' ? { [cookieAtBoot]: loadMessages(cookieAtBoot) } : {};

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);
  // The copy on screen and its locale move together, once the chunk arrives,
  // so text, number formats and direction never disagree.
  const [shown, setShown] = useState<{ locale: Locale; messages: Messages }>({ locale: 'en', messages: EN_MESSAGES });

  useEffect(() => {
    if (shown.locale === locale) return;
    let live = true;
    const pending = earlyLoad[locale] ?? loadMessages(locale);
    delete earlyLoad[locale];
    pending
      .then((messages) => {
        if (live) startTransition(() => setShown({ locale, messages }));
      })
      .catch(() => {
        // A failed chunk keeps the current language; the next change retries.
      });
    return () => { live = false; };
  }, [locale, shown.locale]);

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
    document.documentElement.lang = shown.locale;
    document.documentElement.dir = isRtl(shown.locale) ? 'rtl' : 'ltr';
  }, [shown.locale]);

  /// Wrap the state flip in startTransition so the locale swap doesn't block
  /// the click that fired it. The MESSAGES slice change re-renders every
  /// useTranslations() consumer (the whole app), which DevTools Performance
  /// showed as a 256ms INP on the language picker. Cookie write stays
  /// synchronous so a subsequent page load lands on the new locale even if
  /// React defers the in-page re-render.
  const setLocale = useCallback((next: Locale) => {
    writeCookieLocale(next);
    startTransition(() => {
      setLocaleState(next);
    });
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale: shown.locale, setLocale, t: clean(shown.messages) }),
    [shown, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback rather than throw, so any component used in a test or storybook
    // without the provider still renders English copy instead of crashing.
    return { locale: DEFAULT_LOCALE, setLocale: () => {}, t: clean(EN_MESSAGES) };
  }
  return ctx;
}

export function useTranslations(): Messages {
  return useLocale().t;
}
