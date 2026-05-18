import type { Locale } from '../locales';
import { en, type Messages } from './en';
import { ar } from './ar';
import { fr } from './fr';
import { hi } from './hi';
import { sw } from './sw';

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = {
  en,
  ar,
  fr,
  hi,
  sw,
};
