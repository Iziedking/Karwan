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
    WORK_CONFIRMED_BY_CLIENT: 'Work confirmed by a past client',
    REGISTERED_BUSINESS: 'Registered business (CAC)',
    OWNS_GITHUB_WORK: 'Has public work on GitHub',
    HUMAN_VERIFIED: 'Verified as a unique person',
  },
  bands: { under_100: 'Under 100', '100_500': '100 to 500', '500_2000': '500 to 2,000', '2000_10000': '2,000 to 10,000', over_10000: 'Over 10,000' },
  record: 'Record',
  tier: "Reputation level",
  startDeal: 'Start a protected deal',
  noNumbers: "This public record shows profile details, reputation level, ratings and checked facts. Ratings include a count. It does not list private messages or identity documents. Blockchain transactions and published deal attestations may reveal addresses and payment details.",
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
    WORK_CONFIRMED_BY_CLIENT: 'عمل أكده عميل سابق',
    REGISTERED_BUSINESS: 'نشاط تجاري مسجل (CAC)',
    OWNS_GITHUB_WORK: 'لديه أعمال منشورة على GitHub',
    HUMAN_VERIFIED: 'تم التحقق منه كشخص فريد',
  },
  bands: { under_100: 'أقل من 100', '100_500': 'من 100 إلى 500', '500_2000': 'من 500 إلى 2,000', '2000_10000': 'من 2,000 إلى 10,000', over_10000: 'أكثر من 10,000' },
  record: 'السجل',
  tier: "مستوى السمعة",
  startDeal: 'ابدأ صفقة محمية',
  noNumbers: "يعرض هذا السجل العام بيانات الملف ومستوى السمعة والتقييمات والحقائق المفحوصة. يشمل التقييم عدد المشاركين. لا يعرض الرسائل الخاصة أو وثائق الهوية. قد تكشف معاملات البلوكشين وإثباتات الصفقات المنشورة عن العناوين وتفاصيل الدفع.",
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
    WORK_CONFIRMED_BY_CLIENT: 'Travail confirmé par un ancien client',
    REGISTERED_BUSINESS: 'Entreprise enregistrée (CAC)',
    OWNS_GITHUB_WORK: 'A du travail public sur GitHub',
    HUMAN_VERIFIED: 'Vérifié comme personne unique',
  },
  bands: { under_100: 'Moins de 100', '100_500': '100 à 500', '500_2000': '500 à 2 000', '2000_10000': '2 000 à 10 000', over_10000: 'Plus de 10 000' },
  record: 'Historique',
  tier: "Niveau de réputation",
  startDeal: 'Démarrer une transaction protégée',
  noNumbers: "Ce dossier public présente le profil, le niveau de réputation, les évaluations et les faits contrôlés. Le nombre d’évaluations est public. Les messages privés et pièces d’identité ne sont pas affichés. Les transactions sur la blockchain et les attestations publiées peuvent révéler des adresses et des informations de paiement.",
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
    WORK_CONFIRMED_BY_CLIENT: 'पिछले ग्राहक द्वारा पुष्टि किया गया काम',
    REGISTERED_BUSINESS: 'पंजीकृत व्यवसाय (CAC)',
    OWNS_GITHUB_WORK: 'GitHub पर सार्वजनिक काम',
    HUMAN_VERIFIED: 'एक अद्वितीय व्यक्ति के रूप में सत्यापित',
  },
  bands: { under_100: '100 से कम', '100_500': '100 से 500', '500_2000': '500 से 2,000', '2000_10000': '2,000 से 10,000', over_10000: '10,000 से अधिक' },
  record: 'रिकॉर्ड',
  tier: "प्रतिष्ठा स्तर",
  startDeal: 'सुरक्षित सौदा शुरू करें',
  noNumbers: "इस सार्वजनिक रिकॉर्ड में प्रोफ़ाइल, प्रतिष्ठा स्तर, रेटिंग और जाँचे गए तथ्य दिखते हैं। रेटिंग की संख्या भी सार्वजनिक है। निजी संदेश या पहचान दस्तावेज़ नहीं दिखते। ब्लॉकचेन लेनदेन और प्रकाशित सौदा प्रमाणों से पते और भुगतान विवरण दिख सकते हैं।",
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
    WORK_CONFIRMED_BY_CLIENT: 'Kazi imethibitishwa na mteja wa awali',
    REGISTERED_BUSINESS: 'Biashara iliyosajiliwa (CAC)',
    OWNS_GITHUB_WORK: 'Ana kazi ya umma kwenye GitHub',
    HUMAN_VERIFIED: 'Amethibitishwa kuwa mtu wa kipekee',
  },
  bands: { under_100: 'Chini ya 100', '100_500': '100 hadi 500', '500_2000': '500 hadi 2,000', '2000_10000': '2,000 hadi 10,000', over_10000: 'Zaidi ya 10,000' },
  record: 'Rekodi',
  tier: "Kiwango cha sifa",
  startDeal: 'Anzisha mkataba uliolindwa',
  noNumbers: "Rekodi hii ya umma inaonyesha wasifu, kiwango cha sifa, tathmini na mambo yaliyokaguliwa. Idadi ya tathmini pia ni ya umma. Haionyeshi ujumbe binafsi au hati za utambulisho. Miamala ya blockchain na uthibitisho wa mikataba uliochapishwa unaweza kuonyesha anwani na maelezo ya malipo.",
  unnamed: 'Mwanachama wa Karwan',
  unavailable: 'Rekodi hii haiwezi kuonyeshwa sasa hivi.',
  usdcDeal: 'Mkataba wa USDC',
};

export const sealedRecordCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', SealedRecordCopy> = { en, ar, fr, hi, sw };
