import type { Locale } from '../locales';

/// What a person's agent does alone, one switch each (view 87): the switches on
/// Settings, the limits for locking money, and the rows on Your agent.
export type AgentSwitchName = 'offers' | 'bargain' | 'agree' | 'lock' | 'find' | 'data' | 'brief';
export type AgentStopReason = 'locks-today' | 'lock-failures' | 'not-family';
export type LockWhoName = 'verified' | 'record' | 'anyone';

export interface AgentSwitchesCopy {
  groupsAria: string;
  groups: { general: string; money: string; agent: string; display: string };
  title: string;
  labels: Record<AgentSwitchName, string>;
  /// Behind the (i) on each switch.
  notes: Record<AgentSwitchName, string>;
  notOpen: string;
  needsAgree: string;
  failed: string;
  rules: string;
  yourAgent: string;
  startTradeWith: string;
  lock: {
    perDeal: string;
    perWeek: string;
    who: string;
    whoValue: Record<LockWhoName, string>;
    perDay: string;
    confirm: string;
    save: string;
    notNow: string;
    order: string;
  };
  agent: {
    trade: string;
    /// The short name of each switch on Your agent.
    rows: Record<AgentSwitchName, string>;
    atYourPrice: string;
    toYourLowest: string;
    insideLimits: string;
    /// {amount} is a money figure.
    aDeal: string;
    aWeek: string;
    on: string;
    /// {label} is a switch's short name.
    offLine: string;
    settings: string;
    /// {n} is how many locks a day the person allows.
    stopped: Record<AgentStopReason, string>;
    turnBackOn: string;
  };
}

const en: AgentSwitchesCopy = {
  groupsAria: 'Settings groups',
  groups: { general: 'General', money: 'Money', agent: 'Agent', display: 'Display' },
  title: 'What it does alone',
  labels: {
    offers: 'Make offers for me',
    bargain: 'Bargain for me',
    agree: 'Agree a price for me',
    lock: 'Lock money for me',
    find: 'Find people for me',
    data: 'Pay for checks and research',
    brief: 'Morning brief',
  },
  notes: {
    offers: 'Your agent offers on requests that fit what you sell, at your price.',
    bargain: 'It answers a counter offer, never below your lowest price or above the most you pay.',
    agree: 'It agrees a price inside your limits. Money stays where it is until it is locked.',
    lock: 'Your agent locks money only in a Karwan escrow, for a deal it agreed inside your limits. Releasing stays with you.',
    find: 'It looks for people who fit what you need or sell and contacts them, inside its daily limit.',
    data: 'It pays for record checks and research from its weekly limit.',
    brief: 'One message each morning with what it did and what waits for you.',
  },
  notOpen: 'Not open yet',
  needsAgree: 'Turn on Agree a price first.',
  failed: 'That did not save. Try again.',
  rules: 'Budgets and rules',
  yourAgent: 'Your agent',
  startTradeWith: 'Start a trade with',
  lock: {
    perDeal: 'The most for one deal',
    perWeek: 'The most in a week',
    who: 'Who it may deal with',
    whoValue: { verified: 'Verified people', record: 'With a record', anyone: 'Anyone' },
    perDay: 'Locks in a day',
    confirm: 'Confirm with passkey',
    save: 'Save',
    notNow: 'Not now',
    order: 'One deal cannot be more than a week.',
  },
  agent: {
    trade: 'What you trade',
    rows: { offers: 'Make offers', bargain: 'Bargain', agree: 'Agree a price', lock: 'Lock money', find: 'Find people', data: 'Checks and research', brief: 'Morning brief' },
    atYourPrice: 'At your price',
    toYourLowest: 'Down to your lowest',
    insideLimits: 'Inside your limits',
    aDeal: '{amount} a deal',
    aWeek: '{amount} a week',
    on: 'On',
    offLine: '{label} is off',
    settings: 'Settings',
    stopped: {
      'locks-today': 'Your agent stopped. It locked money {n} times today, the most you allow in a day.',
      'lock-failures': 'Your agent stopped. Locking money failed 3 times in a row.',
      'not-family': 'Your agent stopped. It was asked to lock money outside a Karwan escrow.',
    },
    turnBackOn: 'Turn back on',
  },
};

const fr: AgentSwitchesCopy = {
  groupsAria: 'Groupes de paramètres',
  groups: { general: 'Général', money: 'Argent', agent: 'Agent', display: 'Affichage' },
  title: 'Ce qu’il fait seul',
  labels: {
    offers: 'Faire des offres pour moi',
    bargain: 'Négocier pour moi',
    agree: 'S’accorder sur un prix pour moi',
    lock: 'Bloquer de l’argent pour moi',
    find: 'Trouver des personnes pour moi',
    data: 'Payer les vérifications et la recherche',
    brief: 'Résumé du matin',
  },
  notes: {
    offers: 'Votre agent fait des offres sur les demandes qui correspondent à ce que vous vendez, à votre prix.',
    bargain: 'Il répond à une contre-offre, jamais sous votre prix le plus bas ni au-dessus de votre maximum.',
    agree: 'Il s’accorde sur un prix dans vos limites. L’argent ne bouge pas tant qu’il n’est pas bloqué.',
    lock: 'Votre agent bloque de l’argent uniquement dans un séquestre Karwan, pour une transaction conclue dans vos limites. La libération reste votre décision.',
    find: 'Il cherche des personnes qui correspondent à ce que vous cherchez ou vendez et les contacte, dans sa limite quotidienne.',
    data: 'Il paie les vérifications de dossier et la recherche sur sa limite hebdomadaire.',
    brief: 'Un message chaque matin avec ce qu’il a fait et ce qui vous attend.',
  },
  notOpen: 'Pas encore ouvert',
  needsAgree: 'Activez d’abord S’accorder sur un prix.',
  failed: 'Cela n’a pas été enregistré. Réessayez.',
  rules: 'Budgets et règles',
  yourAgent: 'Votre agent',
  startTradeWith: 'Commencer un échange avec',
  lock: {
    perDeal: 'Le maximum pour une transaction',
    perWeek: 'Le maximum par semaine',
    who: 'Avec qui il peut traiter',
    whoValue: { verified: 'Personnes vérifiées', record: 'Avec un dossier', anyone: 'Tout le monde' },
    perDay: 'Blocages par jour',
    confirm: 'Confirmer avec la clé d’accès',
    save: 'Enregistrer',
    notNow: 'Pas maintenant',
    order: 'Une transaction ne peut pas dépasser la semaine.',
  },
  agent: {
    trade: 'Ce que vous échangez',
    rows: { offers: 'Faire des offres', bargain: 'Négocier', agree: 'S’accorder sur un prix', lock: 'Bloquer de l’argent', find: 'Trouver des personnes', data: 'Vérifications et recherche', brief: 'Résumé du matin' },
    atYourPrice: 'À votre prix',
    toYourLowest: 'Jusqu’à votre prix le plus bas',
    insideLimits: 'Dans vos limites',
    aDeal: '{amount} par transaction',
    aWeek: '{amount} par semaine',
    on: 'Activé',
    offLine: '{label} est désactivé',
    settings: 'Paramètres',
    stopped: {
      'locks-today': 'Votre agent s’est arrêté. Il a bloqué de l’argent {n} fois aujourd’hui, le maximum que vous autorisez par jour.',
      'lock-failures': 'Votre agent s’est arrêté. Le blocage de l’argent a échoué 3 fois de suite.',
      'not-family': 'Votre agent s’est arrêté. On lui a demandé de bloquer de l’argent hors d’un séquestre Karwan.',
    },
    turnBackOn: 'Réactiver',
  },
};

const ar: AgentSwitchesCopy = {
  groupsAria: 'مجموعات الإعدادات',
  groups: { general: 'عام', money: 'المال', agent: 'الوكيل', display: 'العرض' },
  title: 'ما يفعله وحده',
  labels: {
    offers: 'قدّم العروض عني',
    bargain: 'ساوِم عني',
    agree: 'اتفق على سعر عني',
    lock: 'احجز المال عني',
    find: 'ابحث عن أشخاص لي',
    data: 'ادفع مقابل الفحوص والبحث',
    brief: 'ملخص الصباح',
  },
  notes: {
    offers: 'يقدّم وكيلك عروضًا على الطلبات التي تناسب ما تبيعه، بسعرك.',
    bargain: 'يرد على العرض المقابل، ولا ينزل عن أدنى سعر لك ولا يتجاوز أقصى ما تدفعه.',
    agree: 'يتفق على سعر ضمن حدودك. يبقى المال في مكانه حتى يُحجز.',
    lock: 'يحجز وكيلك المال في ضمان Karwan فقط، لصفقة اتفق عليها ضمن حدودك. الإفراج عن المال يبقى بيدك.',
    find: 'يبحث عن أشخاص يناسبون ما تحتاجه أو تبيعه ويتواصل معهم، ضمن حدّه اليومي.',
    data: 'يدفع مقابل فحوص السجل والبحث من حدّه الأسبوعي.',
    brief: 'رسالة واحدة كل صباح بما فعله وما ينتظرك.',
  },
  notOpen: 'غير متاح بعد',
  needsAgree: 'شغّل الاتفاق على سعر أولًا.',
  failed: 'لم يُحفظ ذلك. حاول مرة أخرى.',
  rules: 'الميزانيات والقواعد',
  yourAgent: 'وكيلك',
  startTradeWith: 'ابدأ التجارة بصفتك',
  lock: {
    perDeal: 'الحد الأقصى لصفقة واحدة',
    perWeek: 'الحد الأقصى في الأسبوع',
    who: 'مع من يمكنه التعامل',
    whoValue: { verified: 'أشخاص موثَّقون', record: 'من لديهم سجل', anyone: 'أي شخص' },
    perDay: 'مرات الحجز في اليوم',
    confirm: 'أكّد بمفتاح المرور',
    save: 'حفظ',
    notNow: 'ليس الآن',
    order: 'لا يمكن أن تزيد الصفقة الواحدة على حد الأسبوع.',
  },
  agent: {
    trade: 'ما تتاجر به',
    rows: { offers: 'تقديم العروض', bargain: 'المساومة', agree: 'الاتفاق على سعر', lock: 'حجز المال', find: 'البحث عن أشخاص', data: 'الفحوص والبحث', brief: 'ملخص الصباح' },
    atYourPrice: 'بسعرك',
    toYourLowest: 'حتى أدنى سعر لك',
    insideLimits: 'ضمن حدودك',
    aDeal: '{amount} للصفقة',
    aWeek: '{amount} في الأسبوع',
    on: 'مفعّل',
    offLine: '{label} متوقف',
    settings: 'الإعدادات',
    stopped: {
      'locks-today': 'توقف وكيلك. حجز المال {n} مرات اليوم، وهو أقصى ما تسمح به في اليوم.',
      'lock-failures': 'توقف وكيلك. فشل حجز المال 3 مرات متتالية.',
      'not-family': 'توقف وكيلك. طُلب منه حجز مال خارج ضمان Karwan.',
    },
    turnBackOn: 'أعد التشغيل',
  },
};

const hi: AgentSwitchesCopy = {
  groupsAria: 'सेटिंग समूह',
  groups: { general: 'सामान्य', money: 'पैसा', agent: 'एजेंट', display: 'डिस्प्ले' },
  title: 'यह अकेले क्या करता है',
  labels: {
    offers: 'मेरे लिए पेशकश करें',
    bargain: 'मेरे लिए मोलभाव करें',
    agree: 'मेरे लिए कीमत पर सहमत हों',
    lock: 'मेरे लिए पैसा लॉक करें',
    find: 'मेरे लिए लोग खोजें',
    data: 'जाँच और रिसर्च के लिए भुगतान',
    brief: 'सुबह का सारांश',
  },
  notes: {
    offers: 'आपका एजेंट उन अनुरोधों पर आपकी कीमत पर पेशकश करता है जो आपकी बिक्री से मेल खाते हैं।',
    bargain: 'यह जवाबी पेशकश का उत्तर देता है, कभी आपकी सबसे कम कीमत से नीचे या आपके अधिकतम भुगतान से ऊपर नहीं।',
    agree: 'यह आपकी सीमाओं के भीतर कीमत पर सहमत होता है। लॉक होने तक पैसा जहाँ है वहीं रहता है।',
    lock: 'आपका एजेंट केवल Karwan एस्क्रो में पैसा लॉक करता है, उस सौदे के लिए जिस पर वह आपकी सीमाओं के भीतर सहमत हुआ। रिलीज़ करना आपके हाथ में रहता है।',
    find: 'यह उन लोगों को खोजता है जो आपकी ज़रूरत या बिक्री से मेल खाते हैं और अपनी दैनिक सीमा के भीतर उनसे संपर्क करता है।',
    data: 'यह रिकॉर्ड जाँच और रिसर्च के लिए अपनी साप्ताहिक सीमा से भुगतान करता है।',
    brief: 'हर सुबह एक संदेश: इसने क्या किया और आपके लिए क्या बाकी है।',
  },
  notOpen: 'अभी उपलब्ध नहीं',
  needsAgree: 'पहले कीमत पर सहमत होना चालू करें।',
  failed: 'यह सहेजा नहीं गया। फिर कोशिश करें।',
  rules: 'बजट और नियम',
  yourAgent: 'आपका एजेंट',
  startTradeWith: 'सौदा किसके रूप में शुरू करें',
  lock: {
    perDeal: 'एक सौदे के लिए अधिकतम',
    perWeek: 'एक हफ़्ते में अधिकतम',
    who: 'यह किसके साथ सौदा कर सकता है',
    whoValue: { verified: 'सत्यापित लोग', record: 'रिकॉर्ड वाले लोग', anyone: 'कोई भी' },
    perDay: 'एक दिन में लॉक',
    confirm: 'पासकी से पुष्टि करें',
    save: 'सहेजें',
    notNow: 'अभी नहीं',
    order: 'एक सौदा हफ़्ते की सीमा से ज़्यादा नहीं हो सकता।',
  },
  agent: {
    trade: 'आप क्या बेचते-खरीदते हैं',
    rows: { offers: 'पेशकश करना', bargain: 'मोलभाव', agree: 'कीमत पर सहमति', lock: 'पैसा लॉक करना', find: 'लोग खोजना', data: 'जाँच और रिसर्च', brief: 'सुबह का सारांश' },
    atYourPrice: 'आपकी कीमत पर',
    toYourLowest: 'आपकी सबसे कम कीमत तक',
    insideLimits: 'आपकी सीमाओं के भीतर',
    aDeal: '{amount} प्रति सौदा',
    aWeek: '{amount} प्रति हफ़्ता',
    on: 'चालू',
    offLine: '{label} बंद है',
    settings: 'सेटिंग',
    stopped: {
      'locks-today': 'आपका एजेंट रुक गया। इसने आज {n} बार पैसा लॉक किया, जो एक दिन में आपकी तय सीमा है।',
      'lock-failures': 'आपका एजेंट रुक गया। पैसा लॉक करना लगातार 3 बार विफल हुआ।',
      'not-family': 'आपका एजेंट रुक गया। इससे Karwan एस्क्रो के बाहर पैसा लॉक करने को कहा गया।',
    },
    turnBackOn: 'फिर चालू करें',
  },
};

const sw: AgentSwitchesCopy = {
  groupsAria: 'Makundi ya mipangilio',
  groups: { general: 'Jumla', money: 'Pesa', agent: 'Wakala', display: 'Mwonekano' },
  title: 'Anachofanya peke yake',
  labels: {
    offers: 'Nitolee ofa',
    bargain: 'Nijadilie bei',
    agree: 'Nikubalie bei',
    lock: 'Nifungie pesa',
    find: 'Nitafutie watu',
    data: 'Lipia ukaguzi na utafiti',
    brief: 'Muhtasari wa asubuhi',
  },
  notes: {
    offers: 'Wakala wako hutoa ofa kwa maombi yanayolingana na unachouza, kwa bei yako.',
    bargain: 'Hujibu ofa pinzani, kamwe si chini ya bei yako ya chini wala juu ya kiwango chako cha juu cha kulipa.',
    agree: 'Hukubali bei ndani ya mipaka yako. Pesa hubaki ilipo hadi ifungwe.',
    lock: 'Wakala wako hufunga pesa kwenye escrow ya Karwan pekee, kwa mkataba aliokubali ndani ya mipaka yako. Kuachilia pesa kunabaki kwako.',
    find: 'Hutafuta watu wanaolingana na unachohitaji au unachouza na kuwasiliana nao, ndani ya kikomo chake cha siku.',
    data: 'Hulipia ukaguzi wa rekodi na utafiti kutoka kwenye kikomo chake cha wiki.',
    brief: 'Ujumbe mmoja kila asubuhi wa alichofanya na kinachokusubiri.',
  },
  notOpen: 'Bado haijafunguliwa',
  needsAgree: 'Washa Kukubali bei kwanza.',
  failed: 'Haikuhifadhiwa. Jaribu tena.',
  rules: 'Bajeti na kanuni',
  yourAgent: 'Wakala wako',
  startTradeWith: 'Anza biashara kama',
  lock: {
    perDeal: 'Kiwango cha juu kwa mkataba mmoja',
    perWeek: 'Kiwango cha juu kwa wiki',
    who: 'Anaweza kufanya biashara na nani',
    whoValue: { verified: 'Watu waliothibitishwa', record: 'Wenye rekodi', anyone: 'Mtu yeyote' },
    perDay: 'Mara za kufunga kwa siku',
    confirm: 'Thibitisha kwa passkey',
    save: 'Hifadhi',
    notNow: 'Si sasa',
    order: 'Mkataba mmoja hauwezi kuzidi kikomo cha wiki.',
  },
  agent: {
    trade: 'Unachofanyia biashara',
    rows: { offers: 'Kutoa ofa', bargain: 'Kujadiliana bei', agree: 'Kukubali bei', lock: 'Kufunga pesa', find: 'Kutafuta watu', data: 'Ukaguzi na utafiti', brief: 'Muhtasari wa asubuhi' },
    atYourPrice: 'Kwa bei yako',
    toYourLowest: 'Hadi bei yako ya chini',
    insideLimits: 'Ndani ya mipaka yako',
    aDeal: '{amount} kwa mkataba',
    aWeek: '{amount} kwa wiki',
    on: 'Imewashwa',
    offLine: '{label} imezimwa',
    settings: 'Mipangilio',
    stopped: {
      'locks-today': 'Wakala wako amesimama. Amefunga pesa mara {n} leo, kiwango cha juu unachoruhusu kwa siku.',
      'lock-failures': 'Wakala wako amesimama. Kufunga pesa kumeshindwa mara 3 mfululizo.',
      'not-family': 'Wakala wako amesimama. Aliombwa kufunga pesa nje ya escrow ya Karwan.',
    },
    turnBackOn: 'Washa tena',
  },
};

export const agentSwitchesCopy: Record<Locale, AgentSwitchesCopy> = { en, fr, ar, hi, sw };
