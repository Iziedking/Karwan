/// Home greets by the reader's own clock (owner, 23 Oct): morning before
/// noon, afternoon until five, evening after.
export interface GreetingsCopy {
  morning: string;
  afternoon: string;
  evening: string;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const greetingsCopy: Record<Locale, GreetingsCopy> = {
  en: { morning: 'Good morning,', afternoon: 'Good afternoon,', evening: 'Good evening,' },
  fr: { morning: 'Bonjour,', afternoon: 'Bon après-midi,', evening: 'Bonsoir,' },
  ar: { morning: 'صباح الخير،', afternoon: 'نهارك سعيد،', evening: 'مساء الخير،' },
  hi: { morning: 'सुप्रभात,', afternoon: 'नमस्ते,', evening: 'शुभ संध्या,' },
  sw: { morning: 'Habari za asubuhi,', afternoon: 'Habari za mchana,', evening: 'Habari za jioni,' },
};
