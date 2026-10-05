import type { AmountBand, SealedReasonCode } from '../../../core/api';

export interface SealedRecordCopy {
  reasons: Record<SealedReasonCode, string>;
  bands: Record<AmountBand, string>;
  record: string;
  tier: string;
  startDeal: string;
  noNumbers: string;
  unnamed: string;
  unavailable: string;
  usdcDeal: string;
}

const en: SealedRecordCopy = {
  reasons: {
    NEW_ON_KARWAN: 'New on Karwan',
    HAS_COMPLETED_DEALS: 'Has completed deals on Karwan',
    MANY_COMPLETED_DEALS: 'Many completed deals on Karwan',
    USUALLY_ON_TIME: 'Usually delivers on time',
    NO_LOST_DISPUTES: 'No lost disputes',
    WORKS_WITH_MANY: 'Has worked with many different clients',
    HUMAN_VERIFIED: 'Verified as a unique person',
  },
  bands: { under_100: 'Under 100', '100_500': '100 to 500', '500_2000': '500 to 2,000', '2000_10000': '2,000 to 10,000', over_10000: 'Over 10,000' },
  record: 'Record',
  tier: 'Tier',
  startDeal: 'Start a protected deal',
  noNumbers: "Karwan never shares anyone's numbers.",
  unnamed: 'Karwan member',
  unavailable: "This record can't be shown right now.",
  usdcDeal: 'USDC deal',
};

const ar: SealedRecordCopy = {
  reasons: {
    NEW_ON_KARWAN: 'جديد على Karwan',
    HAS_COMPLETED_DEALS: 'أتمّ صفقات على Karwan',
    MANY_COMPLETED_DEALS: 'أتمّ صفقات كثيرة على Karwan',
    USUALLY_ON_TIME: 'يسلّم في الموعد عادةً',
    NO_LOST_DISPUTES: 'لم يخسر أي نزاع',
    WORKS_WITH_MANY: 'عمل مع عملاء كثيرين مختلفين',
    HUMAN_VERIFIED: 'تم التحقق منه كشخص فريد',
  },
  bands: { under_100: 'أقل من 100', '100_500': 'من 100 إلى 500', '500_2000': 'من 500 إلى 2,000', '2000_10000': 'من 2,000 إلى 10,000', over_10000: 'أكثر من 10,000' },
  record: 'السجل',
  tier: 'المستوى',
  startDeal: 'ابدأ صفقة محمية',
  noNumbers: 'لا تشارك Karwan أرقام أي شخص أبدًا.',
  unnamed: 'عضو في Karwan',
  unavailable: 'لا يمكن عرض هذا السجل الآن.',
  usdcDeal: 'صفقة USDC',
};

const fr: SealedRecordCopy = {
  reasons: {
    NEW_ON_KARWAN: 'Nouveau sur Karwan',
    HAS_COMPLETED_DEALS: 'A conclu des transactions sur Karwan',
    MANY_COMPLETED_DEALS: 'Nombreuses transactions conclues sur Karwan',
    USUALLY_ON_TIME: 'Livre généralement à temps',
    NO_LOST_DISPUTES: 'Aucun litige perdu',
    WORKS_WITH_MANY: 'A travaillé avec de nombreux clients différents',
    HUMAN_VERIFIED: 'Vérifié comme personne unique',
  },
  bands: { under_100: 'Moins de 100', '100_500': '100 à 500', '500_2000': '500 à 2 000', '2000_10000': '2 000 à 10 000', over_10000: 'Plus de 10 000' },
  record: 'Historique',
  tier: 'Niveau',
  startDeal: 'Démarrer une transaction protégée',
  noNumbers: 'Karwan ne partage jamais les chiffres de personne.',
  unnamed: 'Membre de Karwan',
  unavailable: 'Cet historique ne peut pas être affiché pour le moment.',
  usdcDeal: 'Transaction en USDC',
};

const hi: SealedRecordCopy = {
  reasons: {
    NEW_ON_KARWAN: 'Karwan पर नया',
    HAS_COMPLETED_DEALS: 'Karwan पर सौदे पूरे किए हैं',
    MANY_COMPLETED_DEALS: 'Karwan पर कई सौदे पूरे किए हैं',
    USUALLY_ON_TIME: 'आमतौर पर समय पर डिलीवर करता है',
    NO_LOST_DISPUTES: 'कोई विवाद नहीं हारा',
    WORKS_WITH_MANY: 'कई अलग-अलग ग्राहकों के साथ काम किया है',
    HUMAN_VERIFIED: 'एक अद्वितीय व्यक्ति के रूप में सत्यापित',
  },
  bands: { under_100: '100 से कम', '100_500': '100 से 500', '500_2000': '500 से 2,000', '2000_10000': '2,000 से 10,000', over_10000: '10,000 से अधिक' },
  record: 'रिकॉर्ड',
  tier: 'स्तर',
  startDeal: 'सुरक्षित सौदा शुरू करें',
  noNumbers: 'Karwan कभी किसी के आंकड़े साझा नहीं करता।',
  unnamed: 'Karwan सदस्य',
  unavailable: 'यह रिकॉर्ड अभी नहीं दिखाया जा सकता।',
  usdcDeal: 'USDC सौदा',
};

const sw: SealedRecordCopy = {
  reasons: {
    NEW_ON_KARWAN: 'Mpya kwenye Karwan',
    HAS_COMPLETED_DEALS: 'Amekamilisha mikataba kwenye Karwan',
    MANY_COMPLETED_DEALS: 'Amekamilisha mikataba mingi kwenye Karwan',
    USUALLY_ON_TIME: 'Kwa kawaida huwasilisha kwa wakati',
    NO_LOST_DISPUTES: 'Hajapoteza mgogoro wowote',
    WORKS_WITH_MANY: 'Amefanya kazi na wateja wengi tofauti',
    HUMAN_VERIFIED: 'Amethibitishwa kuwa mtu wa kipekee',
  },
  bands: { under_100: 'Chini ya 100', '100_500': '100 hadi 500', '500_2000': '500 hadi 2,000', '2000_10000': '2,000 hadi 10,000', over_10000: 'Zaidi ya 10,000' },
  record: 'Rekodi',
  tier: 'Kiwango',
  startDeal: 'Anzisha mkataba uliolindwa',
  noNumbers: 'Karwan haishiriki kamwe takwimu za mtu yeyote.',
  unnamed: 'Mwanachama wa Karwan',
  unavailable: 'Rekodi hii haiwezi kuonyeshwa sasa hivi.',
  usdcDeal: 'Mkataba wa USDC',
};

export const sealedRecordCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', SealedRecordCopy> = { en, ar, fr, hi, sw };
