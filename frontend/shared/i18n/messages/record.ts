export type RecordLevel = 'registered' | 'person_verified' | 'work_verified' | 'id_verified';
export type RecordFactKind =
  | 'owned_account'
  | 'person_check'
  | 'client_confirmation'
  | 'invoice'
  | 'cac_match'
  | 'github_work'
  | 'karwan_deal'
  | 'id_check';

export interface RecordCopy {
  levels: Record<RecordLevel, string>;
  kinds: Record<RecordFactKind, string>;
  verifiedFacts: string;
  noFacts: string;
  tier: string;
  until: string;
  proof: string;
  download: string;
  downloadNote: string;
  notFound: string;
  unavailable: string;
  notFoundHint: string;
  retry: string;
  home: string;
}

const en: RecordCopy = {
  levels: {
    registered: 'Registered',
    person_verified: 'Person verified',
    work_verified: 'Work verified',
    id_verified: 'ID verified',
  },
  kinds: {
    owned_account: 'Owns a linked account',
    person_check: 'Verified as one unique person',
    client_confirmation: 'A past client confirmed a job',
    invoice: 'Invoice checked',
    cac_match: 'Registered business (CAC)',
    github_work: 'Public work on GitHub',
    karwan_deal: 'Completed a deal in Karwan escrow',
    id_check: 'Government ID checked',
  },
  verifiedFacts: 'Verified facts',
  noFacts: 'Nothing verified yet.',
  tier: 'Tier',
  until: 'Valid until',
  proof: 'Proof on Arc',
  download: 'Download signed copy',
  downloadNote: 'Anyone can check the signed copy against Karwan’s published key and Arc, without calling Karwan.',
  notFound: 'No Karwan record with that tag.',
  unavailable: 'This record cannot be shown right now.',
  notFoundHint: 'Check the spelling, or ask the person for their link.',
  retry: 'Try again',
  home: 'Go to Karwan',
};

const ar: RecordCopy = {
  levels: {
    registered: 'مسجّل',
    person_verified: 'شخص موثّق',
    work_verified: 'عمل موثّق',
    id_verified: 'هوية موثّقة',
  },
  kinds: {
    owned_account: 'يملك حسابًا مرتبطًا',
    person_check: 'تم التحقق منه كشخص فريد',
    client_confirmation: 'أكد عميل سابق عملًا',
    invoice: 'تم فحص الفاتورة',
    cac_match: 'نشاط تجاري مسجل (CAC)',
    github_work: 'أعمال منشورة على GitHub',
    karwan_deal: 'أتمّ صفقة في ضمان Karwan',
    id_check: 'تم فحص الهوية الحكومية',
  },
  verifiedFacts: 'حقائق موثّقة',
  noFacts: 'لا شيء موثّق بعد.',
  tier: 'المستوى',
  until: 'صالح حتى',
  proof: 'الإثبات على Arc',
  download: 'تنزيل نسخة موقّعة',
  downloadNote: 'يمكن لأي شخص التحقق من النسخة الموقّعة مقابل مفتاح Karwan المنشور وشبكة Arc، دون الاتصال بـ Karwan.',
  notFound: 'لا يوجد سجل Karwan بهذا الوسم.',
  unavailable: 'لا يمكن عرض هذا السجل الآن.',
  notFoundHint: 'تحقق من الكتابة، أو اطلب من الشخص رابطه.',
  retry: 'حاول مرة أخرى',
  home: 'اذهب إلى Karwan',
};

const fr: RecordCopy = {
  levels: {
    registered: 'Inscrit',
    person_verified: 'Personne vérifiée',
    work_verified: 'Travail vérifié',
    id_verified: 'Identité vérifiée',
  },
  kinds: {
    owned_account: 'Possède un compte lié',
    person_check: 'Vérifié comme personne unique',
    client_confirmation: 'Un ancien client a confirmé un travail',
    invoice: 'Facture vérifiée',
    cac_match: 'Entreprise enregistrée (CAC)',
    github_work: 'Travail public sur GitHub',
    karwan_deal: 'A conclu une affaire sous séquestre Karwan',
    id_check: 'Pièce d’identité vérifiée',
  },
  verifiedFacts: 'Faits vérifiés',
  noFacts: 'Rien n’est encore vérifié.',
  tier: 'Niveau',
  until: 'Valable jusqu’au',
  proof: 'Preuve sur Arc',
  download: 'Télécharger la copie signée',
  downloadNote: 'Tout le monde peut vérifier la copie signée avec la clé publiée de Karwan et Arc, sans contacter Karwan.',
  notFound: 'Aucun dossier Karwan avec ce nom.',
  unavailable: 'Ce dossier ne peut pas être affiché pour le moment.',
  notFoundHint: 'Vérifiez l’orthographe, ou demandez son lien à la personne.',
  retry: 'Réessayer',
  home: 'Aller sur Karwan',
};

const hi: RecordCopy = {
  levels: {
    registered: 'पंजीकृत',
    person_verified: 'व्यक्ति सत्यापित',
    work_verified: 'काम सत्यापित',
    id_verified: 'पहचान सत्यापित',
  },
  kinds: {
    owned_account: 'एक जुड़ा हुआ खाता है',
    person_check: 'एक अद्वितीय व्यक्ति के रूप में सत्यापित',
    client_confirmation: 'पिछले ग्राहक ने काम की पुष्टि की',
    invoice: 'चालान जांचा गया',
    cac_match: 'पंजीकृत व्यवसाय (CAC)',
    github_work: 'GitHub पर सार्वजनिक काम',
    karwan_deal: 'Karwan एस्क्रो में सौदा पूरा किया',
    id_check: 'सरकारी पहचान जांची गई',
  },
  verifiedFacts: 'सत्यापित तथ्य',
  noFacts: 'अभी कुछ सत्यापित नहीं है।',
  tier: 'स्तर',
  until: 'मान्य तक',
  proof: 'Arc पर प्रमाण',
  download: 'हस्ताक्षरित प्रति डाउनलोड करें',
  downloadNote: 'कोई भी Karwan से संपर्क किए बिना, Karwan की प्रकाशित कुंजी और Arc से हस्ताक्षरित प्रति जांच सकता है।',
  notFound: 'इस टैग का कोई Karwan रिकॉर्ड नहीं है।',
  unavailable: 'यह रिकॉर्ड अभी दिखाया नहीं जा सकता।',
  notFoundHint: 'वर्तनी जाँचें, या उस व्यक्ति से उनका लिंक माँगें।',
  retry: 'फिर से कोशिश करें',
  home: 'Karwan पर जाएँ',
};

const sw: RecordCopy = {
  levels: {
    registered: 'Amesajiliwa',
    person_verified: 'Mtu amethibitishwa',
    work_verified: 'Kazi imethibitishwa',
    id_verified: 'Kitambulisho kimethibitishwa',
  },
  kinds: {
    owned_account: 'Ana akaunti iliyounganishwa',
    person_check: 'Amethibitishwa kuwa mtu wa kipekee',
    client_confirmation: 'Mteja wa awali alithibitisha kazi',
    invoice: 'Ankara imekaguliwa',
    cac_match: 'Biashara iliyosajiliwa (CAC)',
    github_work: 'Kazi ya umma kwenye GitHub',
    karwan_deal: 'Alikamilisha mkataba kwenye escrow ya Karwan',
    id_check: 'Kitambulisho cha serikali kimekaguliwa',
  },
  verifiedFacts: 'Ukweli uliothibitishwa',
  noFacts: 'Bado hakuna kilichothibitishwa.',
  tier: 'Kiwango',
  until: 'Halali hadi',
  proof: 'Uthibitisho kwenye Arc',
  download: 'Pakua nakala iliyosainiwa',
  downloadNote: 'Mtu yeyote anaweza kukagua nakala iliyosainiwa dhidi ya ufunguo uliochapishwa wa Karwan na Arc, bila kuwasiliana na Karwan.',
  notFound: 'Hakuna rekodi ya Karwan yenye jina hilo.',
  unavailable: 'Rekodi hii haiwezi kuonyeshwa kwa sasa.',
  notFoundHint: 'Kagua tahajia, au muombe mtu huyo kiungo chake.',
  retry: 'Jaribu tena',
  home: 'Nenda Karwan',
};

export const recordCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', RecordCopy> = { en, ar, fr, hi, sw };
