/// The one Deals list (view 44): what needs you, then what is active, then
/// what is finished.
export interface DealsPageCopy {
  title: string;
  needsYou: string;
  active: string;
  finished: string;
  showMore: string;
  empty: string;
  emptyCta: string;
  allActivity: string;
  /// The link from the top of the list on Home to the whole list.
  allDeals: string;
}

export const dealsPageCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DealsPageCopy> = {
  en: {
    title: 'Deals',
    needsYou: 'Needs you',
    active: 'Active',
    finished: 'Finished',
    showMore: 'Show more',
    empty: 'No deals yet.',
    emptyCta: 'Go to the market',
    allActivity: 'All activity',
    allDeals: 'All deals',
  },
  fr: {
    title: 'Accords',
    needsYou: 'À vous d’agir',
    active: 'En cours',
    finished: 'Terminés',
    showMore: 'Voir plus',
    empty: 'Aucun accord pour l’instant.',
    emptyCta: 'Aller au marché',
    allActivity: 'Toute l’activité',
    allDeals: 'Tous les accords',
  },
  ar: {
    title: 'الصفقات',
    needsYou: 'بانتظارك',
    active: 'جارية',
    finished: 'منتهية',
    showMore: 'عرض المزيد',
    empty: 'لا صفقات بعد.',
    emptyCta: 'اذهب إلى السوق',
    allActivity: 'كل النشاط',
    allDeals: 'كل الصفقات',
  },
  hi: {
    title: 'सौदे',
    needsYou: 'आपकी बारी',
    active: 'चालू',
    finished: 'पूरे हुए',
    showMore: 'और देखें',
    empty: 'अभी कोई सौदा नहीं।',
    emptyCta: 'बाज़ार पर जाएँ',
    allActivity: 'सारी गतिविधि',
    allDeals: 'सभी सौदे',
  },
  sw: {
    title: 'Mikataba',
    needsYou: 'Inakusubiri',
    active: 'Inaendelea',
    finished: 'Imekamilika',
    showMore: 'Onyesha zaidi',
    empty: 'Bado hakuna mikataba.',
    emptyCta: 'Nenda sokoni',
    allActivity: 'Shughuli zote',
    allDeals: 'Mikataba yote',
  },
};
