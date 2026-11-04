/// The short fading note that replaces an explainer line (owner notes, 4 Nov).
export interface NudgeCopy {
  close: string;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const nudgeCopy: Record<Locale, NudgeCopy> = {
  en: { close: 'Close' },
  fr: { close: 'Fermer' },
  ar: { close: 'إغلاق' },
  hi: { close: 'बंद करें' },
  sw: { close: 'Funga' },
};
