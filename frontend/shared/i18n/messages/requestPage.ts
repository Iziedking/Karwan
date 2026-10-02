export interface RequestPageCopy {
  request: string;
  budget: string;
  due: string;
  offers: string;
  steps: [string, string, string, string];
  lookingTitle: string;
  lookingBody: string;
  live: string;
  details: string;
  looksFor: string;
  proof: string;
  requestId: string;
  research: string;
  researchEmpty: string;
  verification: string;
  verificationTemplate: string;
}

const en: RequestPageCopy = {
  request: 'Request',
  budget: 'Budget',
  due: 'Due',
  offers: 'Offers',
  steps: ['Posted', 'Offers', 'Agreed', 'Paid'],
  lookingTitle: 'Your agent is asking sellers',
  lookingBody: 'It compares skills, price and records, and tells you as soon as one fits. You decide who to work with.',
  live: 'Live, updates on its own',
  details: 'Details',
  looksFor: 'What your agent looks for',
  proof: 'Proof on Arc',
  requestId: 'Request id',
  research: 'Research',
  researchEmpty: 'Market research and what your agent spent show here once it has looked.',
  verification: 'Seller check',
  verificationTemplate: 'Your agent paid {amount} USDC to check this seller.',
};

const fr: RequestPageCopy = {
  request: 'Demande',
  budget: 'Budget',
  due: 'Échéance',
  offers: 'Offres',
  steps: ['Publiée', 'Offres', 'Accord', 'Payée'],
  lookingTitle: 'Votre agent consulte les vendeurs',
  lookingBody: 'Il compare compétences, prix et historique, et vous prévient dès qu’un vendeur convient. C’est vous qui choisissez.',
  live: 'En direct, se met à jour seul',
  details: 'Détails',
  looksFor: 'Ce que cherche votre agent',
  proof: 'Preuve sur Arc',
  requestId: 'Identifiant de la demande',
  research: 'Recherche',
  researchEmpty: 'L’étude de marché et les dépenses de votre agent apparaissent ici dès qu’il a cherché.',
  verification: 'Vérification du vendeur',
  verificationTemplate: 'Votre agent a payé {amount} USDC pour vérifier ce vendeur.',
};

const ar: RequestPageCopy = {
  request: 'طلب',
  budget: 'الميزانية',
  due: 'الموعد',
  offers: 'العروض',
  steps: ['نُشر', 'العروض', 'الاتفاق', 'الدفع'],
  lookingTitle: 'وكيلك يسأل البائعين',
  lookingBody: 'يقارن المهارات والسعر والسجل، ويخبرك فور أن يناسبك أحدهم. أنت من يختار.',
  live: 'مباشر، يتحدث تلقائيًا',
  details: 'التفاصيل',
  looksFor: 'ما يبحث عنه وكيلك',
  proof: 'الإثبات على Arc',
  requestId: 'معرّف الطلب',
  research: 'البحث',
  researchEmpty: 'يظهر هنا بحث السوق وما أنفقه وكيلك بعد أن يبحث.',
  verification: 'فحص البائع',
  verificationTemplate: 'دفع وكيلك {amount} USDC لفحص هذا البائع.',
};

const hi: RequestPageCopy = {
  request: 'अनुरोध',
  budget: 'बजट',
  due: 'नियत तारीख',
  offers: 'ऑफ़र',
  steps: ['पोस्ट हुआ', 'ऑफ़र', 'सहमति', 'भुगतान'],
  lookingTitle: 'आपका एजेंट विक्रेताओं से पूछ रहा है',
  lookingBody: 'यह कौशल, कीमत और रिकॉर्ड की तुलना करता है और कोई सही मिलते ही बताता है। चुनाव आपका है।',
  live: 'लाइव, अपने आप अपडेट होता है',
  details: 'विवरण',
  looksFor: 'आपका एजेंट क्या खोजता है',
  proof: 'Arc पर प्रमाण',
  requestId: 'अनुरोध आईडी',
  research: 'रिसर्च',
  researchEmpty: 'एजेंट के खोजने के बाद बाज़ार रिसर्च और उसका खर्च यहाँ दिखता है।',
  verification: 'विक्रेता जाँच',
  verificationTemplate: 'आपके एजेंट ने इस विक्रेता की जाँच के लिए {amount} USDC दिए।',
};

const sw: RequestPageCopy = {
  request: 'Ombi',
  budget: 'Bajeti',
  due: 'Tarehe ya mwisho',
  offers: 'Ofa',
  steps: ['Limewekwa', 'Ofa', 'Makubaliano', 'Limelipwa'],
  lookingTitle: 'Wakala wako anauliza wauzaji',
  lookingBody: 'Analinganisha ujuzi, bei na rekodi, na anakujulisha mara mmoja anapofaa. Wewe ndiye unachagua.',
  live: 'Moja kwa moja, inajisasisha',
  details: 'Maelezo',
  looksFor: 'Anachotafuta wakala wako',
  proof: 'Uthibitisho kwenye Arc',
  requestId: 'Kitambulisho cha ombi',
  research: 'Utafiti',
  researchEmpty: 'Utafiti wa soko na alichotumia wakala wako huonekana hapa akishatafuta.',
  verification: 'Ukaguzi wa muuzaji',
  verificationTemplate: 'Wakala wako alilipa USDC {amount} kumkagua muuzaji huyu.',
};

export const requestPageCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', RequestPageCopy> = { en, ar, fr, hi, sw };
