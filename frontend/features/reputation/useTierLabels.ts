'use client';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import type { CompositeTier } from './tierColors';

/// One name per tier, in the reader's language, everywhere a tier is shown.
export const TIER_NAMES: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', Record<CompositeTier, string>> = {
  en: { NEW: 'New', COLD: 'Cold', ESTABLISHED: 'Established', STRONG: 'Strong', ELITE: 'Elite' },
  fr: { NEW: 'Nouveau', COLD: 'Débutant', ESTABLISHED: 'Établi', STRONG: 'Solide', ELITE: 'Élite' },
  ar: { NEW: 'جديد', COLD: 'مبتدئ', ESTABLISHED: 'راسخ', STRONG: 'قوي', ELITE: 'نخبة' },
  hi: { NEW: 'नया', COLD: 'शुरुआती', ESTABLISHED: 'स्थापित', STRONG: 'मज़बूत', ELITE: 'एलीट' },
  sw: { NEW: 'Mpya', COLD: 'Mwanzo', ESTABLISHED: 'Imara', STRONG: 'Thabiti', ELITE: 'Bora' },
};

export function useTierLabels(): Record<CompositeTier, string> {
  const { locale } = useLocale();
  return TIER_NAMES[locale as keyof typeof TIER_NAMES] ?? TIER_NAMES.en;
}
