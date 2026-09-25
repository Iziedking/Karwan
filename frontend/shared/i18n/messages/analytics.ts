export interface AnalyticsCopy {
  title: string;
  lead: string;
  networkTestnet: string;
  networkMainnet: string;
  otherTestnet: string;
  otherMainnet: string;
  updatedNow: string;
  updatedAgo: string;
  block: string;
  hero: { label: string; inDeals: string; inStake: string; inFinance: string; note: string };
  kpis: { deals: string; paidToSellers: string; returnedToBuyers: string; requests: string };
  overTime: {
    title: string;
    moneyTitle: string;
    dealsTitle: string;
    weekOf: string;
    dealsOne: string;
    dealsMany: string;
    indexing: string;
    empty: string;
    showTable: string;
    hideTable: string;
    colWeek: string;
    colUsdc: string;
    colDeals: string;
  };
  went: { title: string; sellers: string; buyers: string; fees: string; share: string; note: string };
  rails: {
    title: string;
    stakeLocked: string;
    stakeTaken: string;
    yieldPaid: string;
    advanced: string;
    repaid: string;
    defaults: string;
  };
  contracts: {
    title: string;
    lead: string;
    retiredTitle: string;
    retiredLead: string;
    version: string;
    holds: string;
    noFunds: string;
    roles: { settlement: string; financing: string; staking: string; treasury: string; registry: string };
  };
  check: { title: string; explorer: string; raw: string; testnetNote: string };
  states: { unscanned: string; error: string; retry: string };
}

const en: AnalyticsCopy = {
  title: 'Karwan in numbers',
  lead: "Every figure is read from Karwan's contracts on Arc. Nothing is typed in by hand, and each contract links to the public explorer.",
  networkTestnet: 'Arc testnet. Test money, no real value.',
  networkMainnet: 'Arc mainnet',
  otherTestnet: 'See the testnet figures',
  otherMainnet: 'See the mainnet figures',
  updatedNow: 'Updated just now',
  updatedAgo: 'Updated {n}s ago',
  block: 'Block {block}',
  hero: {
    label: 'USDC moved through Karwan',
    inDeals: 'Protected in deals',
    inStake: 'Locked as seller stake',
    inFinance: 'Advanced as trade finance',
    note: 'Each dollar is counted once, when it enters a contract.',
  },
  kpis: {
    deals: 'Deals funded',
    paidToSellers: 'Paid to sellers',
    returnedToBuyers: 'Returned to buyers',
    requests: 'Requests posted',
  },
  overTime: {
    title: 'Over time',
    moneyTitle: 'Deal money per week',
    dealsTitle: 'Deals per week',
    weekOf: 'Week of {date}',
    dealsOne: '1 deal',
    dealsMany: '{n} deals',
    indexing: 'Older history is still being indexed ({pct}%). The weekly charts appear when it is done.',
    empty: 'No activity on this network yet.',
    showTable: 'Show as a table',
    hideTable: 'Hide the table',
    colWeek: 'Week',
    colUsdc: 'USDC',
    colDeals: 'Deals',
  },
  went: {
    title: 'Where the deal money went',
    sellers: 'Paid to sellers',
    buyers: 'Returned to buyers',
    fees: 'Karwan fees',
    share: '{pct}% of deal money',
    note: 'Money not listed here is still held in open deals.',
  },
  rails: {
    title: 'Stake and trade finance',
    stakeLocked: 'Stake locked by sellers',
    stakeTaken: 'Stake paid out after failed deals',
    yieldPaid: 'Yield paid to stakers',
    advanced: 'Advanced to suppliers',
    repaid: 'Repaid to financiers',
    defaults: 'Advances not repaid',
  },
  contracts: {
    title: 'The contracts',
    lead: 'The contracts Karwan runs now, and what each one holds.',
    retiredTitle: 'Earlier versions',
    retiredLead: 'When a contract is upgraded, the old one is retired. Its history stays in every total above.',
    version: 'Version {v} of {of}',
    holds: 'Holds {amount} USDC',
    noFunds: 'Holds no money',
    roles: {
      settlement: 'Holds deal money until delivery',
      financing: 'Handles trade-finance advances',
      staking: 'Holds seller stake',
      treasury: 'Collects fees and pays yield',
      registry: 'Keeps the public record',
    },
  },
  check: {
    title: 'Check it yourself',
    explorer: 'Every contract above opens on the Arc explorer.',
    raw: 'The raw figures behind this page',
    testnetNote: 'Testnet figures come from real use of the product with test money. They are not real value.',
  },
  states: {
    unscanned: 'These figures have not been counted on this network yet.',
    error: 'The figures could not be loaded.',
    retry: 'Try again',
  },
};

const fr: AnalyticsCopy = {
  title: 'Karwan en chiffres',
  lead: "Chaque chiffre est lu dans les contrats de Karwan sur Arc. Rien n'est saisi à la main, et chaque contrat renvoie à l'explorateur public.",
  networkTestnet: 'Arc testnet. Argent de test, sans valeur réelle.',
  networkMainnet: 'Arc mainnet',
  otherTestnet: 'Voir les chiffres du testnet',
  otherMainnet: 'Voir les chiffres du mainnet',
  updatedNow: "Mis à jour à l'instant",
  updatedAgo: 'Mis à jour il y a {n} s',
  block: 'Bloc {block}',
  hero: {
    label: 'USDC passés par Karwan',
    inDeals: 'Protégés dans des affaires',
    inStake: 'Bloqués en garantie vendeur',
    inFinance: 'Avancés en financement du commerce',
    note: "Chaque dollar est compté une fois, à son entrée dans un contrat.",
  },
  kpis: {
    deals: 'Affaires financées',
    paidToSellers: 'Versés aux vendeurs',
    returnedToBuyers: 'Rendus aux acheteurs',
    requests: 'Demandes publiées',
  },
  overTime: {
    title: 'Dans le temps',
    moneyTitle: 'Argent des affaires par semaine',
    dealsTitle: 'Affaires par semaine',
    weekOf: 'Semaine du {date}',
    dealsOne: '1 affaire',
    dealsMany: '{n} affaires',
    indexing: "L'historique ancien est encore en cours d'indexation ({pct} %). Les graphiques hebdomadaires apparaîtront ensuite.",
    empty: 'Aucune activité sur ce réseau pour le moment.',
    showTable: 'Afficher en tableau',
    hideTable: 'Masquer le tableau',
    colWeek: 'Semaine',
    colUsdc: 'USDC',
    colDeals: 'Affaires',
  },
  went: {
    title: "Où est allé l'argent des affaires",
    sellers: 'Versés aux vendeurs',
    buyers: 'Rendus aux acheteurs',
    fees: 'Frais Karwan',
    share: "{pct} % de l'argent des affaires",
    note: "L'argent non listé ici est encore détenu dans des affaires en cours.",
  },
  rails: {
    title: 'Garantie et financement du commerce',
    stakeLocked: 'Garantie bloquée par les vendeurs',
    stakeTaken: 'Garantie versée après des affaires échouées',
    yieldPaid: 'Rendement versé aux garants',
    advanced: 'Avancés aux fournisseurs',
    repaid: 'Remboursés aux financeurs',
    defaults: 'Avances non remboursées',
  },
  contracts: {
    title: 'Les contrats',
    lead: 'Les contrats que Karwan utilise aujourd’hui, et ce que chacun détient.',
    retiredTitle: 'Versions précédentes',
    retiredLead: "Quand un contrat est mis à niveau, l'ancien est retiré. Son historique reste dans tous les totaux ci-dessus.",
    version: 'Version {v} sur {of}',
    holds: 'Détient {amount} USDC',
    noFunds: "Ne détient pas d'argent",
    roles: {
      settlement: "Détient l'argent des affaires jusqu'à la livraison",
      financing: 'Gère les avances de financement commercial',
      staking: 'Détient la garantie des vendeurs',
      treasury: 'Perçoit les frais et verse le rendement',
      registry: 'Tient le registre public',
    },
  },
  check: {
    title: 'Vérifiez vous-même',
    explorer: "Chaque contrat ci-dessus s'ouvre dans l'explorateur Arc.",
    raw: 'Les chiffres bruts derrière cette page',
    testnetNote: "Les chiffres du testnet viennent d'un usage réel du produit avec de l'argent de test. Ils n'ont pas de valeur réelle.",
  },
  states: {
    unscanned: "Ces chiffres n'ont pas encore été comptés sur ce réseau.",
    error: "Les chiffres n'ont pas pu être chargés.",
    retry: 'Réessayer',
  },
};

const ar: AnalyticsCopy = {
  title: 'Karwan بالأرقام',
  lead: 'كل رقم هنا مقروء من عقود Karwan على Arc. لا شيء يُكتب يدويًا، وكل عقد مرتبط بالمستكشف العام.',
  networkTestnet: 'شبكة Arc التجريبية. أموال اختبار بلا قيمة حقيقية.',
  networkMainnet: 'شبكة Arc الرئيسية',
  otherTestnet: 'عرض أرقام الشبكة التجريبية',
  otherMainnet: 'عرض أرقام الشبكة الرئيسية',
  updatedNow: 'حُدّث الآن',
  updatedAgo: 'حُدّث قبل {n} ث',
  block: 'الكتلة {block}',
  hero: {
    label: 'USDC مرّت عبر Karwan',
    inDeals: 'محمية في صفقات',
    inStake: 'مقفلة كضمان للبائعين',
    inFinance: 'مقدمة كتمويل تجاري',
    note: 'يُحتسب كل دولار مرة واحدة، عند دخوله إلى عقد.',
  },
  kpis: {
    deals: 'صفقات ممولة',
    paidToSellers: 'مدفوعة للبائعين',
    returnedToBuyers: 'مُعادة للمشترين',
    requests: 'طلبات منشورة',
  },
  overTime: {
    title: 'عبر الزمن',
    moneyTitle: 'أموال الصفقات أسبوعيًا',
    dealsTitle: 'الصفقات أسبوعيًا',
    weekOf: 'أسبوع {date}',
    dealsOne: 'صفقة واحدة',
    dealsMany: '{n} صفقات',
    indexing: 'ما زال السجل الأقدم قيد الفهرسة ({pct}%). تظهر الرسوم الأسبوعية عند الانتهاء.',
    empty: 'لا نشاط على هذه الشبكة بعد.',
    showTable: 'عرض كجدول',
    hideTable: 'إخفاء الجدول',
    colWeek: 'الأسبوع',
    colUsdc: 'USDC',
    colDeals: 'الصفقات',
  },
  went: {
    title: 'أين ذهبت أموال الصفقات',
    sellers: 'مدفوعة للبائعين',
    buyers: 'مُعادة للمشترين',
    fees: 'رسوم Karwan',
    share: '{pct}% من أموال الصفقات',
    note: 'الأموال غير المذكورة هنا ما زالت محفوظة في صفقات مفتوحة.',
  },
  rails: {
    title: 'الضمان والتمويل التجاري',
    stakeLocked: 'ضمان أقفله البائعون',
    stakeTaken: 'ضمان دُفع بعد صفقات فاشلة',
    yieldPaid: 'عائد مدفوع للضامنين',
    advanced: 'مقدم للموردين',
    repaid: 'مُسدّد للممولين',
    defaults: 'سلف لم تُسدّد',
  },
  contracts: {
    title: 'العقود',
    lead: 'العقود التي يشغّلها Karwan الآن، وما يحفظه كل منها.',
    retiredTitle: 'إصدارات سابقة',
    retiredLead: 'عند ترقية عقد يُحال القديم إلى التقاعد. يبقى سجله في كل المجاميع أعلاه.',
    version: 'الإصدار {v} من {of}',
    holds: 'يحفظ {amount} USDC',
    noFunds: 'لا يحفظ أموالًا',
    roles: {
      settlement: 'يحفظ أموال الصفقة حتى التسليم',
      financing: 'يدير سلف التمويل التجاري',
      staking: 'يحفظ ضمان البائعين',
      treasury: 'يجمع الرسوم ويدفع العائد',
      registry: 'يحفظ السجل العام',
    },
  },
  check: {
    title: 'تحقق بنفسك',
    explorer: 'كل عقد أعلاه يُفتح في مستكشف Arc.',
    raw: 'الأرقام الخام خلف هذه الصفحة',
    testnetNote: 'أرقام الشبكة التجريبية ناتجة عن استخدام حقيقي للمنتج بأموال اختبار. ليست ذات قيمة حقيقية.',
  },
  states: {
    unscanned: 'لم تُحتسب هذه الأرقام على هذه الشبكة بعد.',
    error: 'تعذّر تحميل الأرقام.',
    retry: 'حاول مجددًا',
  },
};

const hi: AnalyticsCopy = {
  title: 'Karwan आंकड़ों में',
  lead: 'हर आंकड़ा Arc पर Karwan के कॉन्ट्रैक्ट से पढ़ा गया है। कुछ भी हाथ से नहीं लिखा गया, और हर कॉन्ट्रैक्ट सार्वजनिक एक्सप्लोरर से जुड़ा है।',
  networkTestnet: 'Arc टेस्टनेट। टेस्ट पैसा, कोई असली मूल्य नहीं।',
  networkMainnet: 'Arc मेननेट',
  otherTestnet: 'टेस्टनेट के आंकड़े देखें',
  otherMainnet: 'मेननेट के आंकड़े देखें',
  updatedNow: 'अभी अपडेट हुआ',
  updatedAgo: '{n} सेकंड पहले अपडेट हुआ',
  block: 'ब्लॉक {block}',
  hero: {
    label: 'Karwan से गुज़रे USDC',
    inDeals: 'डील में सुरक्षित',
    inStake: 'विक्रेता स्टेक के रूप में लॉक',
    inFinance: 'ट्रेड फ़ाइनेंस के रूप में अग्रिम',
    note: 'हर डॉलर एक बार गिना जाता है, जब वह किसी कॉन्ट्रैक्ट में आता है।',
  },
  kpis: {
    deals: 'फ़ंड की गई डील',
    paidToSellers: 'विक्रेताओं को भुगतान',
    returnedToBuyers: 'खरीदारों को वापस',
    requests: 'पोस्ट किए गए अनुरोध',
  },
  overTime: {
    title: 'समय के साथ',
    moneyTitle: 'हर हफ़्ते डील का पैसा',
    dealsTitle: 'हर हफ़्ते डील',
    weekOf: '{date} का हफ़्ता',
    dealsOne: '1 डील',
    dealsMany: '{n} डील',
    indexing: 'पुराना इतिहास अभी इंडेक्स हो रहा है ({pct}%)। पूरा होने पर साप्ताहिक चार्ट दिखेंगे।',
    empty: 'इस नेटवर्क पर अभी कोई गतिविधि नहीं।',
    showTable: 'तालिका के रूप में दिखाएँ',
    hideTable: 'तालिका छिपाएँ',
    colWeek: 'हफ़्ता',
    colUsdc: 'USDC',
    colDeals: 'डील',
  },
  went: {
    title: 'डील का पैसा कहाँ गया',
    sellers: 'विक्रेताओं को भुगतान',
    buyers: 'खरीदारों को वापस',
    fees: 'Karwan शुल्क',
    share: 'डील के पैसे का {pct}%',
    note: 'जो पैसा यहाँ नहीं दिखा, वह अभी खुली डील में रखा है।',
  },
  rails: {
    title: 'स्टेक और ट्रेड फ़ाइनेंस',
    stakeLocked: 'विक्रेताओं द्वारा लॉक किया स्टेक',
    stakeTaken: 'असफल डील के बाद चुकाया गया स्टेक',
    yieldPaid: 'स्टेकर्स को दिया गया यील्ड',
    advanced: 'आपूर्तिकर्ताओं को अग्रिम',
    repaid: 'फ़ाइनेंसरों को चुकाया गया',
    defaults: 'न चुकाए गए अग्रिम',
  },
  contracts: {
    title: 'कॉन्ट्रैक्ट',
    lead: 'Karwan अभी जो कॉन्ट्रैक्ट चलाता है, और हर एक में क्या रखा है।',
    retiredTitle: 'पुराने संस्करण',
    retiredLead: 'जब कोई कॉन्ट्रैक्ट अपग्रेड होता है, पुराना रिटायर हो जाता है। उसका इतिहास ऊपर के हर कुल में बना रहता है।',
    version: 'संस्करण {v} / {of}',
    holds: '{amount} USDC रखे हैं',
    noFunds: 'कोई पैसा नहीं रखता',
    roles: {
      settlement: 'डिलीवरी तक डील का पैसा रखता है',
      financing: 'ट्रेड फ़ाइनेंस अग्रिम संभालता है',
      staking: 'विक्रेता स्टेक रखता है',
      treasury: 'शुल्क लेता है और यील्ड देता है',
      registry: 'सार्वजनिक रिकॉर्ड रखता है',
    },
  },
  check: {
    title: 'खुद जाँचें',
    explorer: 'ऊपर का हर कॉन्ट्रैक्ट Arc एक्सप्लोरर में खुलता है।',
    raw: 'इस पेज के पीछे के कच्चे आंकड़े',
    testnetNote: 'टेस्टनेट के आंकड़े टेस्ट पैसे के साथ प्रोडक्ट के असली उपयोग से आते हैं। इनका कोई असली मूल्य नहीं है।',
  },
  states: {
    unscanned: 'इस नेटवर्क पर ये आंकड़े अभी गिने नहीं गए हैं।',
    error: 'आंकड़े लोड नहीं हो सके।',
    retry: 'फिर से कोशिश करें',
  },
};

const sw: AnalyticsCopy = {
  title: 'Karwan kwa takwimu',
  lead: 'Kila takwimu inasomwa kutoka kwenye mikataba ya Karwan kwenye Arc. Hakuna kinachoandikwa kwa mkono, na kila mkataba unaunganishwa na kivinjari cha umma.',
  networkTestnet: 'Arc testnet. Pesa za majaribio, hazina thamani halisi.',
  networkMainnet: 'Arc mainnet',
  otherTestnet: 'Tazama takwimu za testnet',
  otherMainnet: 'Tazama takwimu za mainnet',
  updatedNow: 'Imesasishwa sasa hivi',
  updatedAgo: 'Imesasishwa sekunde {n} zilizopita',
  block: 'Bloku {block}',
  hero: {
    label: 'USDC zilizopita kupitia Karwan',
    inDeals: 'Zimelindwa kwenye mikataba',
    inStake: 'Zimefungwa kama dhamana ya wauzaji',
    inFinance: 'Zimetolewa kama ufadhili wa biashara',
    note: 'Kila dola huhesabiwa mara moja, inapoingia kwenye mkataba.',
  },
  kpis: {
    deals: 'Mikataba iliyofadhiliwa',
    paidToSellers: 'Zimelipwa kwa wauzaji',
    returnedToBuyers: 'Zimerudishwa kwa wanunuzi',
    requests: 'Maombi yaliyowekwa',
  },
  overTime: {
    title: 'Kwa muda',
    moneyTitle: 'Pesa za mikataba kwa wiki',
    dealsTitle: 'Mikataba kwa wiki',
    weekOf: 'Wiki ya {date}',
    dealsOne: 'Mkataba 1',
    dealsMany: 'Mikataba {n}',
    indexing: 'Historia ya zamani bado inaorodheshwa ({pct}%). Chati za kila wiki zitaonekana ikikamilika.',
    empty: 'Bado hakuna shughuli kwenye mtandao huu.',
    showTable: 'Onyesha kama jedwali',
    hideTable: 'Ficha jedwali',
    colWeek: 'Wiki',
    colUsdc: 'USDC',
    colDeals: 'Mikataba',
  },
  went: {
    title: 'Pesa za mikataba zilienda wapi',
    sellers: 'Zimelipwa kwa wauzaji',
    buyers: 'Zimerudishwa kwa wanunuzi',
    fees: 'Ada za Karwan',
    share: '{pct}% ya pesa za mikataba',
    note: 'Pesa ambazo hazijaorodheshwa hapa bado zimeshikiliwa kwenye mikataba iliyo wazi.',
  },
  rails: {
    title: 'Dhamana na ufadhili wa biashara',
    stakeLocked: 'Dhamana iliyofungwa na wauzaji',
    stakeTaken: 'Dhamana iliyolipwa baada ya mikataba iliyoshindwa',
    yieldPaid: 'Faida iliyolipwa kwa wenye dhamana',
    advanced: 'Zimetolewa kwa wasambazaji',
    repaid: 'Zimelipwa kwa wafadhili',
    defaults: 'Ufadhili ambao haukulipwa',
  },
  contracts: {
    title: 'Mikataba',
    lead: 'Mikataba ambayo Karwan inaendesha sasa, na kile kila mmoja unashikilia.',
    retiredTitle: 'Matoleo ya awali',
    retiredLead: 'Mkataba unapoboreshwa, wa zamani unastaafishwa. Historia yake inabaki kwenye kila jumla hapo juu.',
    version: 'Toleo {v} kati ya {of}',
    holds: 'Unashikilia USDC {amount}',
    noFunds: 'Haushikilii pesa',
    roles: {
      settlement: 'Unashikilia pesa za mkataba hadi uwasilishaji',
      financing: 'Inashughulikia ufadhili wa biashara',
      staking: 'Unashikilia dhamana ya wauzaji',
      treasury: 'Unakusanya ada na kulipa faida',
      registry: 'Unatunza rekodi ya umma',
    },
  },
  check: {
    title: 'Hakiki mwenyewe',
    explorer: 'Kila mkataba hapo juu unafunguka kwenye kivinjari cha Arc.',
    raw: 'Takwimu ghafi nyuma ya ukurasa huu',
    testnetNote: 'Takwimu za testnet zinatokana na matumizi halisi ya bidhaa kwa pesa za majaribio. Hazina thamani halisi.',
  },
  states: {
    unscanned: 'Takwimu hizi bado hazijahesabiwa kwenye mtandao huu.',
    error: 'Takwimu hazikuweza kupakiwa.',
    retry: 'Jaribu tena',
  },
};

export const analyticsCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', AnalyticsCopy> = { en, ar, fr, hi, sw };
