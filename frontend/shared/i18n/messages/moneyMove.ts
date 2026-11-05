import type { DisplayCurrency } from '@/features/money/displayCurrency';

/// Words for view 51: the Balance and Agents switch, the one sheet for adding,
/// topping up and withdrawing, the Transfer balance moves, Show amounts in,
/// and the receipt that opens from Recent. Explanations live behind info
/// icons (`tip` keys), never as sentences on the screen.
export interface MoneyMoveCopy {
  currency: {
    title: string;
    tip: string;
    rateNote: string;
    asHeld: string;
    noRate: string;
    names: Record<DisplayCurrency, string>;
  };
  tabs: { label: string; balance: string; agents: string };
  home: {
    available: string;
    agentsHold: string;
    agentsSpent: string;
    agentsSpentEmpty: string;
    allActivity: string;
    moveToBalance: string;
    addToIt: string;
    buyingDoes: string;
    sellingDoes: string;
    added: string;
  };
  add: {
    title: string;
    fromWallet: string;
    swipe: string;
    otherWays: string;
    exchange: string;
    exchangeNote: string;
    show: string;
    card: string;
    soon: string;
    connect: string;
    connectNote: string;
    change: string;
    networks: string;
    amount: string;
    arrivesSeconds: string;
    arrivesTwenty: string;
    walletFee: string;
    cta: string;
    from: string;
    there: string;
    confirmed: string;
    moving: string;
    inBalance: string;
    usually: string;
    close: string;
    declined: string;
    empty: string;
  };
  pool: {
    moveTitle: string;
    addTitle: string;
    addTip: string;
    from: string;
    to: string;
    arrives: string;
    inSeconds: string;
    yourBalance: string;
    transferBalance: string;
    confirmOnce: string;
    moveCta: string;
    readySeconds: string;
    readyAbout15: string;
    onItsWay: string;
  };
  agents: {
    topUp: string;
    withdraw: string;
    to: string;
    from: string;
    yourBalance: string;
    instantly: string;
    aWallet: string;
    walletNote: string;
    topUpCta: string;
    withdrawCta: string;
    allOfIt: string;
    toAgent: string;
  };
  one: {
    yourBalance: string;
    whereItIs: string;
    ready: string;
    readyNote: string;
    transfer: string;
    transferNote: string;
    withAgent: string;
    withAgentNote: string;
    moveToWallet: string;
    addToAgent: string;
    heldNote: string;
    canSpend: string;
    aWeek: string;
    changeLimit: string;
    limitTitle: string;
    limitLead: string;
    about: string;
    save: string;
    limitNote: string;
    limitTip: string;
    spentWeek: string;
    spentDetail: string;
    leftWeek: string;
    leftNote: string;
    agentSpent: string;
    saved: string;
    saveFailed: string;
  };
  receipt: {
    title: string;
    completed: string;
    pending: string;
    from: string;
    to: string;
    when: string;
    reference: string;
    about: string;
  };
}

const en: MoneyMoveCopy = {
  currency: {
    title: 'Show amounts in',
    tip: 'Your money stays in USDC. This only changes how amounts read.',
    rateNote: 'Rates update every minute.',
    asHeld: 'As it is held',
    noRate: 'Rate not available right now',
    names: { USDC: 'Digital dollar', NGN: 'Nigerian naira', USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', CNY: 'Chinese yuan', INR: 'Indian rupee', AED: 'UAE dirham', KES: 'Kenyan shilling', XOF: 'West African franc' },
  },
  tabs: { label: 'Show', balance: 'Balance', agents: 'Agents' },
  home: {
    available: 'Available balance',
    agentsHold: 'Your agents hold',
    agentsSpent: 'What your agents spent',
    agentsSpentEmpty: 'Nothing spent yet.',
    allActivity: 'All activity',
    moveToBalance: 'Move to balance',
    addToIt: 'Add',
    buyingDoes: 'Pays for what you buy',
    sellingDoes: 'Collects what you sell',
    added: '{amount} USDC added from {network}',
  },
  add: {
    title: 'Add money',
    fromWallet: 'From your wallet',
    swipe: 'Swipe for more networks',
    otherWays: 'Other ways',
    exchange: 'From an exchange',
    exchangeNote: 'Your address for any network',
    show: 'Show',
    card: 'Card',
    soon: 'Soon',
    connect: 'Connect a wallet',
    connectNote: 'See what you hold on each network',
    change: 'Change',
    networks: 'Networks',
    amount: 'Amount',
    arrivesSeconds: 'Arrives in seconds',
    arrivesTwenty: 'About 20 seconds',
    walletFee: 'Your wallet shows the network fee',
    cta: 'Add {amount} USDC',
    from: 'From {network}',
    there: '{amount} USDC on {network}',
    confirmed: 'Confirmed in your wallet',
    moving: 'Moving to your balance',
    inBalance: 'In your balance',
    usually: 'Usually under 20 seconds. You can close this, we tell you when it lands.',
    close: 'Close',
    declined: 'Nothing moved. Try again when you are ready.',
    empty: 'No USDC in this wallet yet.',
  },
  pool: {
    moveTitle: 'Move to balance',
    addTitle: 'Add to Transfer balance',
    addTip: 'It stays on its network. Spend it here any time.',
    from: 'From',
    to: 'To',
    arrives: 'Arrives',
    inSeconds: 'In seconds',
    yourBalance: 'Your balance',
    transferBalance: 'Transfer balance',
    confirmOnce: 'Your wallet asks you to confirm once',
    moveCta: 'Move {amount} USDC',
    readySeconds: 'Ready in seconds',
    readyAbout15: 'Ready in about 15 minutes',
    onItsWay: '{amount} USDC on its way',
  },
  agents: {
    topUp: 'Top up',
    withdraw: 'Withdraw',
    to: 'To',
    from: 'From',
    yourBalance: 'Your balance',
    instantly: 'Arrives instantly',
    aWallet: 'A wallet on another network',
    walletNote: 'Base, Ethereum, Solana and more',
    topUpCta: 'Top up {amount} USDC',
    withdrawCta: 'Withdraw {amount} USDC',
    allOfIt: 'All of it',
    toAgent: 'To {agent}',
  },
  one: {
    yourBalance: 'Your balance',
    whereItIs: 'Where it is',
    ready: 'Ready to send',
    readyNote: 'Your wallet',
    transfer: 'Transfer balance',
    transferNote: 'Ready in seconds',
    withAgent: 'With your agent',
    withAgentNote: 'For checks and deals',
    moveToWallet: 'Move to your wallet',
    addToAgent: 'Add',
    heldNote: 'Held in your deals ({amount} USDC) is not counted until the deal ends.',
    canSpend: 'Your agent can spend',
    aWeek: 'USDC a week',
    changeLimit: 'Change limit',
    limitTitle: 'Weekly limit',
    limitLead: 'Your agent can spend each week on checks',
    about: 'About {n} record checks',
    save: 'Save',
    limitNote: 'Deals still wait for your OK.',
    limitTip: 'A record check costs 0.005 USDC. When the limit is reached, your agent stops paying for checks until the week moves on.',
    spentWeek: 'Spent this week',
    spentDetail: '{checks} record checks, {searches} searches',
    leftWeek: 'Left this week',
    leftNote: 'Until the week moves on',
    agentSpent: 'What your agent spent',
    saved: 'Limit saved',
    saveFailed: 'The limit was not saved. Try again.',
  },
  receipt: { title: 'Receipt', completed: 'Completed', pending: 'On its way', from: 'From', to: 'To', when: 'When', reference: 'Reference', about: 'About {amount}' },
};

const fr: MoneyMoveCopy = {
  currency: {
    title: 'Afficher les montants en',
    tip: 'Votre argent reste en USDC. Seul l’affichage des montants change.',
    rateNote: 'Les taux sont mis à jour chaque minute.',
    asHeld: 'Tel qu’il est détenu',
    noRate: 'Taux indisponible pour le moment',
    names: { USDC: 'Dollar numérique', NGN: 'Naira nigérian', USD: 'Dollar américain', EUR: 'Euro', GBP: 'Livre sterling', CNY: 'Yuan chinois', INR: 'Roupie indienne', AED: 'Dirham des Émirats', KES: 'Shilling kényan', XOF: 'Franc CFA d’Afrique de l’Ouest' },
  },
  tabs: { label: 'Afficher', balance: 'Solde', agents: 'Agents' },
  home: {
    available: 'Solde disponible',
    agentsHold: 'Vos agents détiennent',
    agentsSpent: 'Ce que vos agents ont dépensé',
    agentsSpentEmpty: 'Rien de dépensé pour l’instant.',
    allActivity: 'Toute l’activité',
    moveToBalance: 'Verser au solde',
    addToIt: 'Ajouter',
    buyingDoes: 'Paie ce que vous achetez',
    sellingDoes: 'Encaisse ce que vous vendez',
    added: '{amount} USDC ajoutés depuis {network}',
  },
  add: {
    title: 'Ajouter de l’argent',
    fromWallet: 'Depuis votre portefeuille',
    swipe: 'Faites glisser pour d’autres réseaux',
    otherWays: 'Autres moyens',
    exchange: 'Depuis une plateforme d’échange',
    exchangeNote: 'Votre adresse pour tout réseau',
    show: 'Afficher',
    card: 'Carte',
    soon: 'Bientôt',
    connect: 'Connecter un portefeuille',
    connectNote: 'Voir ce que vous détenez sur chaque réseau',
    change: 'Changer',
    networks: 'Réseaux',
    amount: 'Montant',
    arrivesSeconds: 'Arrive en quelques secondes',
    arrivesTwenty: 'Environ 20 secondes',
    walletFee: 'Votre portefeuille affiche les frais de réseau',
    cta: 'Ajouter {amount} USDC',
    from: 'Depuis {network}',
    there: '{amount} USDC sur {network}',
    confirmed: 'Confirmé dans votre portefeuille',
    moving: 'En route vers votre solde',
    inBalance: 'Sur votre solde',
    usually: 'En général moins de 20 secondes. Vous pouvez fermer, nous vous prévenons à l’arrivée.',
    close: 'Fermer',
    declined: 'Rien n’a bougé. Réessayez quand vous êtes prêt.',
    empty: 'Pas encore d’USDC dans ce portefeuille.',
  },
  pool: {
    moveTitle: 'Verser au solde',
    addTitle: 'Ajouter au solde de transfert',
    addTip: 'Il reste sur son réseau. Dépensez-le ici quand vous voulez.',
    from: 'De',
    to: 'Vers',
    arrives: 'Arrivée',
    inSeconds: 'En quelques secondes',
    yourBalance: 'Votre solde',
    transferBalance: 'Solde de transfert',
    confirmOnce: 'Votre portefeuille vous demande une seule confirmation',
    moveCta: 'Verser {amount} USDC',
    readySeconds: 'Prêt en quelques secondes',
    readyAbout15: 'Prêt dans environ 15 minutes',
    onItsWay: '{amount} USDC en route',
  },
  agents: {
    topUp: 'Recharger',
    withdraw: 'Retirer',
    to: 'Vers',
    from: 'De',
    yourBalance: 'Votre solde',
    instantly: 'Arrive tout de suite',
    aWallet: 'Un portefeuille sur un autre réseau',
    walletNote: 'Base, Ethereum, Solana et d’autres',
    topUpCta: 'Recharger {amount} USDC',
    withdrawCta: 'Retirer {amount} USDC',
    allOfIt: 'La totalité',
    toAgent: 'Vers {agent}',
  },
  one: {
    yourBalance: 'Votre solde',
    whereItIs: 'Où il se trouve',
    ready: 'Prêt à envoyer',
    readyNote: 'Votre portefeuille',
    transfer: 'Solde de transfert',
    transferNote: 'Prêt en quelques secondes',
    withAgent: 'Chez votre agent',
    withAgentNote: 'Pour les vérifications et les accords',
    moveToWallet: 'Déplacer vers votre portefeuille',
    addToAgent: 'Ajouter',
    heldNote: 'Le montant bloqué dans vos accords ({amount} USDC) n’est pas compté avant la fin de l’accord.',
    canSpend: 'Votre agent peut dépenser',
    aWeek: 'USDC par semaine',
    changeLimit: 'Changer la limite',
    limitTitle: 'Limite hebdomadaire',
    limitLead: 'Ce que votre agent peut dépenser chaque semaine en vérifications',
    about: 'Environ {n} vérifications de profil',
    save: 'Enregistrer',
    limitNote: 'Les accords attendent toujours votre accord.',
    limitTip: 'Une vérification de profil coûte 0,005 USDC. Quand la limite est atteinte, votre agent cesse de payer des vérifications jusqu’à la semaine suivante.',
    spentWeek: 'Dépensé cette semaine',
    spentDetail: '{checks} vérifications, {searches} recherches',
    leftWeek: 'Reste cette semaine',
    leftNote: 'Jusqu’à la semaine suivante',
    agentSpent: 'Ce que votre agent a dépensé',
    saved: 'Limite enregistrée',
    saveFailed: 'La limite n’a pas été enregistrée. Réessayez.',
  },
  receipt: { title: 'Reçu', completed: 'Terminé', pending: 'En route', from: 'De', to: 'Vers', when: 'Date', reference: 'Référence', about: 'Environ {amount}' },
};

const ar: MoneyMoveCopy = {
  currency: {
    title: 'عرض المبالغ بـ',
    tip: 'تبقى أموالك بعملة USDC. هذا يغيّر طريقة عرض المبالغ فقط.',
    rateNote: 'تتحدث الأسعار كل دقيقة.',
    asHeld: 'كما هي محفوظة',
    noRate: 'السعر غير متاح الآن',
    names: { USDC: 'الدولار الرقمي', NGN: 'النيرة النيجيرية', USD: 'الدولار الأمريكي', EUR: 'اليورو', GBP: 'الجنيه الإسترليني', CNY: 'اليوان الصيني', INR: 'الروبية الهندية', AED: 'الدرهم الإماراتي', KES: 'الشلن الكيني', XOF: 'فرنك غرب أفريقيا' },
  },
  tabs: { label: 'عرض', balance: 'الرصيد', agents: 'الوكلاء' },
  home: {
    available: 'الرصيد المتاح',
    agentsHold: 'لدى وكلائك',
    agentsSpent: 'ما أنفقه وكلاؤك',
    agentsSpentEmpty: 'لم يُنفق شيء بعد.',
    allActivity: 'كل النشاط',
    moveToBalance: 'انقل إلى الرصيد',
    addToIt: 'أضف',
    buyingDoes: 'يدفع ثمن ما تشتريه',
    sellingDoes: 'يحصّل ثمن ما تبيعه',
    added: 'أُضيف {amount} USDC من {network}',
  },
  add: {
    title: 'إضافة مال',
    fromWallet: 'من محفظتك',
    swipe: 'اسحب لمزيد من الشبكات',
    otherWays: 'طرق أخرى',
    exchange: 'من منصة تداول',
    exchangeNote: 'عنوانك لأي شبكة',
    show: 'اعرض',
    card: 'بطاقة',
    soon: 'قريبًا',
    connect: 'اربط محفظة',
    connectNote: 'اعرف ما تملكه على كل شبكة',
    change: 'غيّر',
    networks: 'الشبكات',
    amount: 'المبلغ',
    arrivesSeconds: 'يصل خلال ثوانٍ',
    arrivesTwenty: 'نحو 20 ثانية',
    walletFee: 'تعرض محفظتك رسوم الشبكة',
    cta: 'أضف {amount} USDC',
    from: 'من {network}',
    there: '{amount} USDC على {network}',
    confirmed: 'تم التأكيد في محفظتك',
    moving: 'في الطريق إلى رصيدك',
    inBalance: 'في رصيدك',
    usually: 'عادةً أقل من 20 ثانية. يمكنك الإغلاق، وسنخبرك عند الوصول.',
    close: 'إغلاق',
    declined: 'لم يتحرك شيء. حاول مجددًا عندما تكون جاهزًا.',
    empty: 'لا يوجد USDC في هذه المحفظة بعد.',
  },
  pool: {
    moveTitle: 'انقل إلى الرصيد',
    addTitle: 'أضف إلى رصيد التحويل',
    addTip: 'يبقى على شبكته. أنفقه هنا متى شئت.',
    from: 'من',
    to: 'إلى',
    arrives: 'الوصول',
    inSeconds: 'خلال ثوانٍ',
    yourBalance: 'رصيدك',
    transferBalance: 'رصيد التحويل',
    confirmOnce: 'تطلب منك محفظتك التأكيد مرة واحدة',
    moveCta: 'انقل {amount} USDC',
    readySeconds: 'جاهز خلال ثوانٍ',
    readyAbout15: 'جاهز خلال نحو 15 دقيقة',
    onItsWay: '{amount} USDC في الطريق',
  },
  agents: {
    topUp: 'اشحن',
    withdraw: 'اسحب',
    to: 'إلى',
    from: 'من',
    yourBalance: 'رصيدك',
    instantly: 'يصل فورًا',
    aWallet: 'محفظة على شبكة أخرى',
    walletNote: 'Base وEthereum وSolana وغيرها',
    topUpCta: 'اشحن {amount} USDC',
    withdrawCta: 'اسحب {amount} USDC',
    allOfIt: 'المبلغ كله',
    toAgent: 'إلى {agent}',
  },
  one: {
    yourBalance: 'رصيدك',
    whereItIs: 'أين هو',
    ready: 'جاهز للإرسال',
    readyNote: 'محفظتك',
    transfer: 'رصيد التحويل',
    transferNote: 'جاهز خلال ثوانٍ',
    withAgent: 'لدى وكيلك',
    withAgentNote: 'للتحقق والصفقات',
    moveToWallet: 'انقل إلى محفظتك',
    addToAgent: 'إضافة',
    heldNote: 'المبلغ المحجوز في صفقاتك ({amount} USDC) لا يُحتسب حتى تنتهي الصفقة.',
    canSpend: 'يمكن لوكيلك أن ينفق',
    aWeek: 'USDC في الأسبوع',
    changeLimit: 'تغيير الحد',
    limitTitle: 'الحد الأسبوعي',
    limitLead: 'ما يمكن لوكيلك إنفاقه كل أسبوع على التحقق',
    about: 'نحو {n} عملية تحقق من السجل',
    save: 'حفظ',
    limitNote: 'الصفقات تنتظر موافقتك دائمًا.',
    limitTip: 'يكلّف التحقق من سجل واحد 0.005 USDC. عند بلوغ الحد يتوقف وكيلك عن الدفع للتحقق حتى يمضي الأسبوع.',
    spentWeek: 'أُنفق هذا الأسبوع',
    spentDetail: '{checks} عمليات تحقق، {searches} عمليات بحث',
    leftWeek: 'المتبقي هذا الأسبوع',
    leftNote: 'حتى يمضي الأسبوع',
    agentSpent: 'ما أنفقه وكيلك',
    saved: 'تم حفظ الحد',
    saveFailed: 'لم يُحفظ الحد. حاول مرة أخرى.',
  },
  receipt: { title: 'الإيصال', completed: 'مكتمل', pending: 'في الطريق', from: 'من', to: 'إلى', when: 'التاريخ', reference: 'المرجع', about: 'نحو {amount}' },
};

const hi: MoneyMoveCopy = {
  currency: {
    title: 'रकम इसमें दिखाएं',
    tip: 'आपका पैसा USDC में ही रहता है। इससे सिर्फ़ रकम दिखने का तरीका बदलता है।',
    rateNote: 'दरें हर मिनट अपडेट होती हैं।',
    asHeld: 'जैसा रखा है',
    noRate: 'दर अभी उपलब्ध नहीं है',
    names: { USDC: 'डिजिटल डॉलर', NGN: 'नाइजीरियाई नायरा', USD: 'अमेरिकी डॉलर', EUR: 'यूरो', GBP: 'ब्रिटिश पाउंड', CNY: 'चीनी युआन', INR: 'भारतीय रुपया', AED: 'यूएई दिरहम', KES: 'केन्याई शिलिंग', XOF: 'पश्चिम अफ़्रीकी फ़्रैंक' },
  },
  tabs: { label: 'दिखाएं', balance: 'बैलेंस', agents: 'एजेंट' },
  home: {
    available: 'उपलब्ध बैलेंस',
    agentsHold: 'आपके एजेंटों के पास',
    agentsSpent: 'आपके एजेंटों ने क्या खर्च किया',
    agentsSpentEmpty: 'अभी तक कुछ खर्च नहीं हुआ।',
    allActivity: 'सारी गतिविधि',
    moveToBalance: 'बैलेंस में भेजें',
    addToIt: 'जोड़ें',
    buyingDoes: 'आपकी खरीद का भुगतान करता है',
    sellingDoes: 'आपकी बिक्री का पैसा लेता है',
    added: '{network} से {amount} USDC जोड़े गए',
  },
  add: {
    title: 'पैसे जोड़ें',
    fromWallet: 'आपके वॉलेट से',
    swipe: 'और नेटवर्क के लिए स्वाइप करें',
    otherWays: 'दूसरे तरीके',
    exchange: 'किसी एक्सचेंज से',
    exchangeNote: 'किसी भी नेटवर्क के लिए आपका पता',
    show: 'दिखाएं',
    card: 'कार्ड',
    soon: 'जल्द',
    connect: 'वॉलेट जोड़ें',
    connectNote: 'देखें कि हर नेटवर्क पर आपके पास क्या है',
    change: 'बदलें',
    networks: 'नेटवर्क',
    amount: 'रकम',
    arrivesSeconds: 'कुछ सेकंड में पहुंचता है',
    arrivesTwenty: 'लगभग 20 सेकंड',
    walletFee: 'आपका वॉलेट नेटवर्क शुल्क दिखाता है',
    cta: '{amount} USDC जोड़ें',
    from: '{network} से',
    there: '{network} पर {amount} USDC',
    confirmed: 'आपके वॉलेट में पुष्टि हुई',
    moving: 'आपके बैलेंस की ओर जा रहा है',
    inBalance: 'आपके बैलेंस में',
    usually: 'आमतौर पर 20 सेकंड से कम। आप इसे बंद कर सकते हैं, पहुंचने पर हम बताएंगे।',
    close: 'बंद करें',
    declined: 'कुछ नहीं भेजा गया। तैयार होने पर फिर कोशिश करें।',
    empty: 'इस वॉलेट में अभी USDC नहीं है।',
  },
  pool: {
    moveTitle: 'बैलेंस में भेजें',
    addTitle: 'ट्रांसफ़र बैलेंस में जोड़ें',
    addTip: 'यह अपने नेटवर्क पर रहता है। इसे यहां कभी भी खर्च करें।',
    from: 'से',
    to: 'को',
    arrives: 'पहुंचता है',
    inSeconds: 'कुछ सेकंड में',
    yourBalance: 'आपका बैलेंस',
    transferBalance: 'ट्रांसफ़र बैलेंस',
    confirmOnce: 'आपका वॉलेट एक बार पुष्टि मांगता है',
    moveCta: '{amount} USDC भेजें',
    readySeconds: 'कुछ सेकंड में तैयार',
    readyAbout15: 'लगभग 15 मिनट में तैयार',
    onItsWay: '{amount} USDC रास्ते में',
  },
  agents: {
    topUp: 'टॉप अप',
    withdraw: 'निकालें',
    to: 'को',
    from: 'से',
    yourBalance: 'आपका बैलेंस',
    instantly: 'तुरंत पहुंचता है',
    aWallet: 'दूसरे नेटवर्क पर कोई वॉलेट',
    walletNote: 'Base, Ethereum, Solana और भी',
    topUpCta: '{amount} USDC टॉप अप करें',
    withdrawCta: '{amount} USDC निकालें',
    allOfIt: 'पूरा',
    toAgent: '{agent} को',
  },
  one: {
    yourBalance: 'आपका बैलेंस',
    whereItIs: 'यह कहाँ है',
    ready: 'भेजने के लिए तैयार',
    readyNote: 'आपका वॉलेट',
    transfer: 'ट्रांसफ़र बैलेंस',
    transferNote: 'कुछ सेकंड में तैयार',
    withAgent: 'आपके एजेंट के पास',
    withAgentNote: 'जाँच और सौदों के लिए',
    moveToWallet: 'अपने वॉलेट में भेजें',
    addToAgent: 'जोड़ें',
    heldNote: 'आपके सौदों में रोकी गई राशि ({amount} USDC) सौदा पूरा होने तक नहीं गिनी जाती।',
    canSpend: 'आपका एजेंट खर्च कर सकता है',
    aWeek: 'USDC प्रति सप्ताह',
    changeLimit: 'सीमा बदलें',
    limitTitle: 'साप्ताहिक सीमा',
    limitLead: 'आपका एजेंट हर सप्ताह जाँच पर कितना खर्च कर सकता है',
    about: 'लगभग {n} रिकॉर्ड जाँच',
    save: 'सहेजें',
    limitNote: 'सौदे अब भी आपकी मंज़ूरी का इंतज़ार करते हैं।',
    limitTip: 'एक रिकॉर्ड जाँच 0.005 USDC की है। सीमा पूरी होने पर आपका एजेंट सप्ताह बीतने तक जाँच के लिए भुगतान बंद कर देता है।',
    spentWeek: 'इस सप्ताह खर्च',
    spentDetail: '{checks} रिकॉर्ड जाँच, {searches} खोज',
    leftWeek: 'इस सप्ताह बाकी',
    leftNote: 'सप्ताह बीतने तक',
    agentSpent: 'आपके एजेंट ने क्या खर्च किया',
    saved: 'सीमा सहेजी गई',
    saveFailed: 'सीमा सहेजी नहीं गई। फिर से कोशिश करें।',
  },
  receipt: { title: 'रसीद', completed: 'पूरा हुआ', pending: 'रास्ते में', from: 'से', to: 'को', when: 'कब', reference: 'संदर्भ', about: 'लगभग {amount}' },
};

const sw: MoneyMoveCopy = {
  currency: {
    title: 'Onyesha kiasi kwa',
    tip: 'Pesa yako inabaki katika USDC. Hii inabadilisha tu jinsi kiasi kinavyosomeka.',
    rateNote: 'Viwango vinasasishwa kila dakika.',
    asHeld: 'Kama inavyoshikiliwa',
    noRate: 'Kiwango hakipatikani sasa hivi',
    names: { USDC: 'Dola ya kidijitali', NGN: 'Naira ya Nigeria', USD: 'Dola ya Marekani', EUR: 'Yuro', GBP: 'Pauni ya Uingereza', CNY: 'Yuan ya China', INR: 'Rupia ya India', AED: 'Dirham ya UAE', KES: 'Shilingi ya Kenya', XOF: 'Faranga ya Afrika Magharibi' },
  },
  tabs: { label: 'Onyesha', balance: 'Salio', agents: 'Mawakala' },
  home: {
    available: 'Salio linalopatikana',
    agentsHold: 'Mawakala wako wanashikilia',
    agentsSpent: 'Mawakala wako walichotumia',
    agentsSpentEmpty: 'Bado hakuna kilichotumika.',
    allActivity: 'Shughuli zote',
    moveToBalance: 'Hamishia kwenye salio',
    addToIt: 'Ongeza',
    buyingDoes: 'Hulipia unachonunua',
    sellingDoes: 'Hupokea malipo ya unachouza',
    added: 'USDC {amount} zimeongezwa kutoka {network}',
  },
  add: {
    title: 'Ongeza pesa',
    fromWallet: 'Kutoka kwenye pochi yako',
    swipe: 'Telezesha kwa mitandao zaidi',
    otherWays: 'Njia nyingine',
    exchange: 'Kutoka kwenye soko la kubadilisha',
    exchangeNote: 'Anwani yako kwa mtandao wowote',
    show: 'Onyesha',
    card: 'Kadi',
    soon: 'Hivi karibuni',
    connect: 'Unganisha pochi',
    connectNote: 'Ona ulicho nacho kwenye kila mtandao',
    change: 'Badilisha',
    networks: 'Mitandao',
    amount: 'Kiasi',
    arrivesSeconds: 'Hufika kwa sekunde chache',
    arrivesTwenty: 'Takriban sekunde 20',
    walletFee: 'Pochi yako inaonyesha ada ya mtandao',
    cta: 'Ongeza USDC {amount}',
    from: 'Kutoka {network}',
    there: 'USDC {amount} kwenye {network}',
    confirmed: 'Imethibitishwa kwenye pochi yako',
    moving: 'Inaelekea kwenye salio lako',
    inBalance: 'Iko kwenye salio lako',
    usually: 'Kwa kawaida chini ya sekunde 20. Unaweza kufunga, tutakuambia ikifika.',
    close: 'Funga',
    declined: 'Hakuna kilichohamishwa. Jaribu tena ukiwa tayari.',
    empty: 'Bado hakuna USDC kwenye pochi hii.',
  },
  pool: {
    moveTitle: 'Hamishia kwenye salio',
    addTitle: 'Ongeza kwenye salio la uhamisho',
    addTip: 'Inabaki kwenye mtandao wake. Itumie hapa wakati wowote.',
    from: 'Kutoka',
    to: 'Kwenda',
    arrives: 'Inafika',
    inSeconds: 'Kwa sekunde chache',
    yourBalance: 'Salio lako',
    transferBalance: 'Salio la uhamisho',
    confirmOnce: 'Pochi yako itakuomba uthibitishe mara moja',
    moveCta: 'Hamisha USDC {amount}',
    readySeconds: 'Tayari kwa sekunde chache',
    readyAbout15: 'Tayari baada ya takriban dakika 15',
    onItsWay: 'USDC {amount} ziko njiani',
  },
  agents: {
    topUp: 'Ongeza',
    withdraw: 'Toa',
    to: 'Kwenda',
    from: 'Kutoka',
    yourBalance: 'Salio lako',
    instantly: 'Hufika papo hapo',
    aWallet: 'Pochi kwenye mtandao mwingine',
    walletNote: 'Base, Ethereum, Solana na mingine',
    topUpCta: 'Ongeza USDC {amount}',
    withdrawCta: 'Toa USDC {amount}',
    allOfIt: 'Yote',
    toAgent: 'Kwenda {agent}',
  },
  one: {
    yourBalance: 'Salio lako',
    whereItIs: 'Liko wapi',
    ready: 'Tayari kutuma',
    readyNote: 'Pochi yako',
    transfer: 'Salio la uhamisho',
    transferNote: 'Tayari kwa sekunde',
    withAgent: 'Kwa wakala wako',
    withAgentNote: 'Kwa ukaguzi na mikataba',
    moveToWallet: 'Hamishia kwenye pochi yako',
    addToAgent: 'Ongeza',
    heldNote: 'Kilichoshikiliwa kwenye mikataba yako ({amount} USDC) hakihesabiwi hadi mkataba uishe.',
    canSpend: 'Wakala wako anaweza kutumia',
    aWeek: 'USDC kwa wiki',
    changeLimit: 'Badilisha kikomo',
    limitTitle: 'Kikomo cha wiki',
    limitLead: 'Wakala wako anaweza kutumia kila wiki kwa ukaguzi',
    about: 'Takriban ukaguzi {n} wa rekodi',
    save: 'Hifadhi',
    limitNote: 'Mikataba bado inasubiri idhini yako.',
    limitTip: 'Ukaguzi mmoja wa rekodi ni 0.005 USDC. Kikomo kikifikiwa, wakala wako anaacha kulipia ukaguzi hadi wiki isonge.',
    spentWeek: 'Imetumika wiki hii',
    spentDetail: 'Ukaguzi {checks}, utafutaji {searches}',
    leftWeek: 'Imebaki wiki hii',
    leftNote: 'Hadi wiki isonge',
    agentSpent: 'Wakala wako alichotumia',
    saved: 'Kikomo kimehifadhiwa',
    saveFailed: 'Kikomo hakijahifadhiwa. Jaribu tena.',
  },
  receipt: { title: 'Risiti', completed: 'Imekamilika', pending: 'Iko njiani', from: 'Kutoka', to: 'Kwenda', when: 'Lini', reference: 'Kumbukumbu', about: 'Takriban {amount}' },
};

export const moneyMoveCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', MoneyMoveCopy> = { en, fr, ar, hi, sw };
