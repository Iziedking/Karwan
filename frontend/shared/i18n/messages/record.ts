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
  meaning: string;
  privacy: string;
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
  score: string;
  scoreOf: string;
  completed: string;
  onTime: string;
  disputesLost: string;
  sources: string;
  sourceKarwan: string;
  connected: string;
  otherPlatforms: string;
  noPartners: string;
}

const en: RecordCopy = {
  meaning: "Reputation level reflects trade history and guarantee activity. Ratings come from customers. Checks cover only the stated evidence and do not guarantee future performance.",
  privacy: "This public record shows profile details, reputation level, ratings and checked facts. Ratings include a count. It does not list private messages or identity documents. Blockchain transactions and published deal attestations may reveal addresses and payment details.",
  levels: {
    registered: "Account created",
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
  tier: "Reputation level",
  until: 'Valid until',
  proof: 'Proof on Arc',
  download: 'Download signed copy',
  downloadNote: 'Anyone can check the signed copy against Karwan’s published key and Arc, without calling Karwan.',
  notFound: 'No Karwan record with that tag.',
  unavailable: 'This record cannot be shown right now.',
  notFoundHint: 'Check the spelling, or ask the person for their link.',
  retry: 'Try again',
  home: 'Go to Karwan',
  score: "Record score",
  scoreOf: '{n} of 100',
  completed: 'Completed deals',
  onTime: 'On time',
  disputesLost: 'Disputes lost',
  sources: "Record sources",
  sourceKarwan: 'Karwan',
  connected: 'Connected',
  otherPlatforms: 'Other platforms',
  noPartners: 'No partner platforms yet',
};

const ar: RecordCopy = {
  meaning: "يعكس مستوى السمعة سجل التعاملات ونشاط الضمان. التقييمات من العملاء. تقتصر الفحوص على الأدلة المحددة ولا تضمن الأداء المستقبلي.",
  privacy: "يعرض هذا السجل العام بيانات الملف ومستوى السمعة والتقييمات والحقائق المفحوصة. يشمل التقييم عدد المشاركين. لا يعرض الرسائل الخاصة أو وثائق الهوية. قد تكشف معاملات البلوكشين وإثباتات الصفقات المنشورة عن العناوين وتفاصيل الدفع.",
  levels: {
    registered: "تم إنشاء الحساب",
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
  tier: "مستوى السمعة",
  until: 'صالح حتى',
  proof: 'الإثبات على Arc',
  download: 'تنزيل نسخة موقّعة',
  downloadNote: 'يمكن لأي شخص التحقق من النسخة الموقّعة مقابل مفتاح Karwan المنشور وشبكة Arc، دون الاتصال بـ Karwan.',
  notFound: 'لا يوجد سجل Karwan بهذا الوسم.',
  unavailable: 'لا يمكن عرض هذا السجل الآن.',
  notFoundHint: 'تحقق من الكتابة، أو اطلب من الشخص رابطه.',
  retry: 'حاول مرة أخرى',
  home: 'اذهب إلى Karwan',
  score: "درجة السجل",
  scoreOf: '{n} من 100',
  completed: 'صفقات مكتملة',
  onTime: 'في الموعد',
  disputesLost: 'نزاعات خاسرة',
  sources: "مصادر السجل",
  sourceKarwan: 'Karwan',
  connected: 'متصل',
  otherPlatforms: 'منصات أخرى',
  noPartners: 'لا منصات شريكة بعد',
};

const fr: RecordCopy = {
  meaning: "Le niveau de réputation reflète les échanges et la garantie. Les évaluations viennent des clients. Les contrôles portent sur les éléments indiqués et ne garantissent pas les résultats futurs.",
  privacy: "Ce dossier public présente le profil, le niveau de réputation, les évaluations et les faits contrôlés. Le nombre d’évaluations est public. Les messages privés et pièces d’identité ne sont pas affichés. Les transactions sur la blockchain et les attestations publiées peuvent révéler des adresses et des informations de paiement.",
  levels: {
    registered: "Compte créé",
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
  tier: "Niveau de réputation",
  until: 'Valable jusqu’au',
  proof: 'Preuve sur Arc',
  download: 'Télécharger la copie signée',
  downloadNote: 'Tout le monde peut vérifier la copie signée avec la clé publiée de Karwan et Arc, sans contacter Karwan.',
  notFound: 'Aucun dossier Karwan avec ce nom.',
  unavailable: 'Ce dossier ne peut pas être affiché pour le moment.',
  notFoundHint: 'Vérifiez l’orthographe, ou demandez son lien à la personne.',
  retry: 'Réessayer',
  home: 'Aller sur Karwan',
  score: "Score du dossier",
  scoreOf: '{n} sur 100',
  completed: 'Affaires terminées',
  onTime: 'Dans les délais',
  disputesLost: 'Litiges perdus',
  sources: "Sources du dossier",
  sourceKarwan: 'Karwan',
  connected: 'Connecté',
  otherPlatforms: 'Autres plateformes',
  noPartners: 'Aucune plateforme partenaire pour l’instant',
};

const hi: RecordCopy = {
  meaning: "प्रतिष्ठा स्तर व्यापार इतिहास और गारंटी गतिविधि पर आधारित है। रेटिंग ग्राहकों से मिलती है। जाँच केवल बताए गए प्रमाणों पर लागू होती है और भविष्य के प्रदर्शन की गारंटी नहीं देती।",
  privacy: "इस सार्वजनिक रिकॉर्ड में प्रोफ़ाइल, प्रतिष्ठा स्तर, रेटिंग और जाँचे गए तथ्य दिखते हैं। रेटिंग की संख्या भी सार्वजनिक है। निजी संदेश या पहचान दस्तावेज़ नहीं दिखते। ब्लॉकचेन लेनदेन और प्रकाशित सौदा प्रमाणों से पते और भुगतान विवरण दिख सकते हैं।",
  levels: {
    registered: "खाता बनाया गया",
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
  tier: "प्रतिष्ठा स्तर",
  until: 'मान्य तक',
  proof: 'Arc पर प्रमाण',
  download: 'हस्ताक्षरित प्रति डाउनलोड करें',
  downloadNote: 'कोई भी Karwan से संपर्क किए बिना, Karwan की प्रकाशित कुंजी और Arc से हस्ताक्षरित प्रति जांच सकता है।',
  notFound: 'इस टैग का कोई Karwan रिकॉर्ड नहीं है।',
  unavailable: 'यह रिकॉर्ड अभी दिखाया नहीं जा सकता।',
  notFoundHint: 'वर्तनी जाँचें, या उस व्यक्ति से उनका लिंक माँगें।',
  retry: 'फिर से कोशिश करें',
  home: 'Karwan पर जाएँ',
  score: "रिकॉर्ड स्कोर",
  scoreOf: '100 में से {n}',
  completed: 'पूरे सौदे',
  onTime: 'समय पर',
  disputesLost: 'हारे गए विवाद',
  sources: "रिकॉर्ड के स्रोत",
  sourceKarwan: 'Karwan',
  connected: 'जुड़ा है',
  otherPlatforms: 'दूसरे प्लेटफ़ॉर्म',
  noPartners: 'अभी कोई साझेदार प्लेटफ़ॉर्म नहीं',
};

const sw: RecordCopy = {
  meaning: "Kiwango cha sifa kinatokana na historia ya biashara na shughuli za dhamana. Tathmini zinatoka kwa wateja. Ukaguzi unahusu ushahidi uliotajwa tu na hauhakikishi utendaji wa baadaye.",
  privacy: "Rekodi hii ya umma inaonyesha wasifu, kiwango cha sifa, tathmini na mambo yaliyokaguliwa. Idadi ya tathmini pia ni ya umma. Haionyeshi ujumbe binafsi au hati za utambulisho. Miamala ya blockchain na uthibitisho wa mikataba uliochapishwa unaweza kuonyesha anwani na maelezo ya malipo.",
  levels: {
    registered: "Akaunti imeundwa",
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
  tier: "Kiwango cha sifa",
  until: 'Halali hadi',
  proof: 'Uthibitisho kwenye Arc',
  download: 'Pakua nakala iliyosainiwa',
  downloadNote: 'Mtu yeyote anaweza kukagua nakala iliyosainiwa dhidi ya ufunguo uliochapishwa wa Karwan na Arc, bila kuwasiliana na Karwan.',
  notFound: 'Hakuna rekodi ya Karwan yenye jina hilo.',
  unavailable: 'Rekodi hii haiwezi kuonyeshwa kwa sasa.',
  notFoundHint: 'Kagua tahajia, au muombe mtu huyo kiungo chake.',
  retry: 'Jaribu tena',
  home: 'Nenda Karwan',
  score: "Alama ya rekodi",
  scoreOf: '{n} kati ya 100',
  completed: 'Mipango iliyokamilika',
  onTime: 'Kwa wakati',
  disputesLost: 'Mizozo aliyoshindwa',
  sources: "Vyanzo vya rekodi",
  sourceKarwan: 'Karwan',
  connected: 'Imeunganishwa',
  otherPlatforms: 'Majukwaa mengine',
  noPartners: 'Bado hakuna majukwaa washirika',
};

export const recordCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', RecordCopy> = { en, ar, fr, hi, sw };
