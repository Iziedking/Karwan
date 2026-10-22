import type { Locale } from '../locales';
import type { Messages } from './en';
import { en } from './en';
import { ar } from './ar';
import { fr } from './fr';
import { hi } from './hi';
import { sw } from './sw';

/// Every locale at once, for tests and build scripts. The app loads one
/// locale at a time through ./index.ts; importing this from app code puts all
/// five in the first download.
export const MESSAGES: Record<Locale, Messages> = { en, ar, fr, hi, sw };
