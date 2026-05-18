/// Supported locales at launch. Adding a new locale requires (1) a new entry
/// here, (2) a matching messages file under `messages/`, and (3) registering it
/// in `messages/index.ts`.
export const LOCALES = ['en', 'ar', 'fr', 'hi', 'sw'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
  hi: 'हिन्दी',
  sw: 'Kiswahili',
};

/// English display labels for the locale names. Used when rendering the
/// language list to a user whose current locale we don't yet know.
export const LOCALE_LABELS_EN: Record<Locale, string> = {
  en: 'English',
  ar: 'Arabic',
  fr: 'French',
  hi: 'Hindi',
  sw: 'Swahili',
};

export const RTL_LOCALES: Locale[] = ['ar'];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function pickLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const parts = header
    .split(',')
    .map((p) => p.trim().split(';')[0]?.trim().toLowerCase() ?? '')
    .filter(Boolean);
  for (const tag of parts) {
    const primary = tag.split('-')[0] ?? tag;
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
