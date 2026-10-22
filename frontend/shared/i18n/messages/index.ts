import type { Locale } from '../locales';
import { en, type Messages } from './en';

export type { Messages };

/// English ships with the page: it is the server render and the fallback.
/// Every other locale is its own chunk, fetched only by someone who reads it,
/// so a visitor downloads one language instead of five.
export const EN_MESSAGES: Messages = en;

const loaders: Record<Exclude<Locale, 'en'>, () => Promise<Messages>> = {
  ar: () => import('./ar').then((m) => m.ar),
  fr: () => import('./fr').then((m) => m.fr),
  hi: () => import('./hi').then((m) => m.hi),
  sw: () => import('./sw').then((m) => m.sw),
};

export function loadMessages(locale: Locale): Promise<Messages> {
  return locale === 'en' ? Promise.resolve(en) : loaders[locale]();
}
