import type { DealState } from '@/features/deals/dealsList';

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
  /// The move a row that needs you carries on desktop.
  move: Record<'release' | 'approve' | 'pay' | 'deliver' | 'claim', string>;
  /// The pill on every deal: where it stands at a glance (owner notes, 3 Nov 2026).
  state: Record<DealState, string>;
}

export const dealsPageCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DealsPageCopy> = {
  en: {
    title: 'Deals',
    needsYou: 'Needs you',
    active: 'Active',
    finished: 'Ended',
    showMore: 'Show more',
    empty: 'No deals yet.',
    emptyCta: 'Go to the market',
    allActivity: 'All activity',
    allDeals: 'All deals',
    move: { release: 'Release', approve: 'Approve', pay: 'Pay in', deliver: 'Deliver', claim: 'Claim' },
    state: { yourMove: 'Your move', active: 'Active', disputed: 'In dispute', paidOut: 'Paid out', cancelled: 'Cancelled', refunding: 'Refunding', refunded: 'Refunded', split: 'Split', ended: 'Ended' },
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
    move: { release: 'Libérer', approve: 'Accepter', pay: 'Payer', deliver: 'Livrer', claim: 'Réclamer' },
    state: { yourMove: 'À vous', active: 'En cours', disputed: 'En litige', paidOut: 'Payé', cancelled: 'Annulé', refunding: 'Remboursement en cours', refunded: 'Remboursé', split: 'Partagé', ended: 'Terminé' },
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
    move: { release: 'حرّر', approve: 'وافق', pay: 'ادفع', deliver: 'سلّم', claim: 'اطلب' },
    state: { yourMove: 'دورك', active: 'جارية', disputed: 'في نزاع', paidOut: 'تم الدفع', cancelled: 'ألغيت', refunding: 'جارٍ الاسترداد', refunded: 'تم الاسترداد', split: 'مقسّمة', ended: 'منتهية' },
  },
  hi: {
    title: 'सौदे',
    needsYou: 'आपकी बारी',
    active: 'चालू',
    finished: 'ख़त्म हुए',
    showMore: 'और देखें',
    empty: 'अभी कोई सौदा नहीं।',
    emptyCta: 'बाज़ार पर जाएँ',
    allActivity: 'सारी गतिविधि',
    allDeals: 'सभी सौदे',
    move: { release: 'जारी करें', approve: 'मंज़ूर करें', pay: 'भुगतान करें', deliver: 'डिलीवर करें', claim: 'दावा करें' },
    state: { yourMove: 'आपकी बारी', active: 'चालू', disputed: 'विवाद में', paidOut: 'भुगतान हुआ', cancelled: 'रद्द', refunding: 'रिफ़ंड हो रहा है', refunded: 'रिफ़ंड हुआ', split: 'बँटा', ended: 'ख़त्म' },
  },
  sw: {
    title: 'Mikataba',
    needsYou: 'Inakusubiri',
    active: 'Inaendelea',
    finished: 'Zilizoisha',
    showMore: 'Onyesha zaidi',
    empty: 'Bado hakuna mikataba.',
    emptyCta: 'Nenda sokoni',
    allActivity: 'Shughuli zote',
    allDeals: 'Mikataba yote',
    move: { release: 'Toa', approve: 'Kubali', pay: 'Lipa', deliver: 'Wasilisha', claim: 'Dai' },
    state: { yourMove: 'Zamu yako', active: 'Inaendelea', disputed: 'Kwenye mzozo', paidOut: 'Imelipwa', cancelled: 'Imeghairiwa', refunding: 'Inarejeshwa', refunded: 'Imerejeshwa', split: 'Imegawanywa', ended: 'Imeisha' },
  },
};
