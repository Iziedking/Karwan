/// Words for view 51, fourth and fifth rounds: Add money and Withdraw as pages,
/// the card that stays until Done, one Money page with Balance, Agent and Deal
/// guarantee, and the tidy Profile. Explanations sit behind info tips.
export interface MoneyPagesCopy {
  tabs: { label: string; balance: string; agent: string; guarantee: string };
  /// From an exchange, for an account that signs with its own wallet.
  walletDeposit: string;
  tips: { balance: string; agent: string; guarantee: string };
  added: {
    title: string;
    fromLine: string;
    from: string;
    to: string;
    yourBalance: string;
    took: string;
    seconds: string;
    fee: string;
    feeWallet: string;
    done: string;
    addMore: string;
    allActivity: string;
    otherWays: string;
    freeTest: string;
  };
  withdraw: {
    title: string;
    sendTo: string;
    comingSoon: string;
    yourWallet: string;
    anotherWallet: string;
    anotherNote: string;
    karwan: string;
    karwanNote: string;
    bank: string;
    card: string;
    soon: string;
    address: string;
    badAddress: string;
    network: string;
    continue: string;
    toLine: string;
    ready: string;
    elsewhere: string;
    bringIt: string;
    review: string;
    sentTitle: string;
    sentLine: string;
    took: string;
    another: string;
  };
  agent: {
    withAgent: string;
    line: string;
    topUp: string;
    withdraw: string;
    changeLimit: string;
    topUpTitle: string;
    withdrawTitle: string;
    spentOf: string;
    leftLine: string;
    limitError: string;
  };
  guarantee: {
    inPlace: string;
    notCounted: string;
    add: string;
    withdraw: string;
    collect: string;
    cancel: string;
    earns: string;
    earnsValue: string;
    holding: string;
    ready: string;
    comingBack: string;
    comingBackValue: string;
    readyToCollect: string;
    addTitle: string;
    withdrawTitle: string;
    addCta: string;
    withdrawCta: string;
    addNote: string;
    withdrawNote: string;
    fromBalance: string;
    readyLine: string;
    doneAdd: string;
    doneWithdraw: string;
    off: string;
    earnings: string;
  };
  profile: {
    money: string;
    moneyLine: string;
    trading: string;
    account: string;
    preferences: string;
    assistantLine: string;
    showAmounts: string;
    moreSettings: string;
    edit: string;
  };
}

const en: MoneyPagesCopy = {
  walletDeposit: 'Send USDC to your wallet address. On {arc} it lands in your balance. On another network it shows under From your wallet.',
  tabs: { label: 'Money', balance: 'Balance', agent: 'Agent', guarantee: 'Deal guarantee' },
  tips: {
    balance: 'Money you can spend now: your wallet, your Transfer balance and anything still with your agent.',
    agent: 'Money set aside for your agent. It pays for record checks and finding sellers, up to your weekly limit. Deals always wait for your OK.',
    guarantee: 'Money you set aside to protect your buyers. It earns while it sits. A deal can hold part of it until the deal ends. It isn’t counted in your balance.',
  },
  added: {
    title: '{amount} USDC added',
    fromLine: 'From {network}, just now',
    from: 'From',
    to: 'To',
    yourBalance: 'Your balance',
    took: 'Took',
    seconds: '{n} seconds',
    fee: 'Network fee',
    feeWallet: 'Paid in your wallet',
    done: 'Done',
    addMore: 'Add more',
    allActivity: 'All activity',
    otherWays: 'Other ways',
    freeTest: 'Get free test USDC',
  },
  withdraw: {
    title: 'Withdraw',
    sendTo: 'Send it to',
    comingSoon: 'Coming soon',
    yourWallet: 'Your wallet',
    anotherWallet: 'Another wallet or an exchange',
    anotherNote: 'Paste an address, pick the network',
    karwan: 'Someone on Karwan',
    karwanNote: 'Find them by their tag',
    bank: 'A bank account',
    card: 'A card',
    soon: 'Soon',
    address: 'Their address',
    badAddress: 'Check the address. It starts with 0x and has 42 characters.',
    network: 'Network',
    continue: 'Continue',
    toLine: 'To {address} on {network}',
    ready: '{amount} USDC ready to withdraw',
    elsewhere: '{amount} USDC more is in your Transfer balance or with your agent.',
    bringIt: 'Bring it here',
    review: 'Review {amount} USDC',
    sentTitle: '{amount} USDC sent',
    sentLine: 'To {address} on {network}',
    took: 'Took',
    another: 'Withdraw more',
  },
  agent: {
    withAgent: 'With your agent',
    line: 'Part of your balance. Spends up to {limit} USDC a week on checks.',
    topUp: 'Top up',
    withdraw: 'Withdraw',
    changeLimit: 'Change limit',
    topUpTitle: 'Top up your agent',
    withdrawTitle: 'Withdraw from your agent',
    spentOf: '{spent} of {limit}',
    leftLine: '{left} left. {checks} record checks and {searches} searches so far.',
    limitError: 'Your limit didn’t load.',
  },
  guarantee: {
    inPlace: 'In place',
    notCounted: 'Not counted in your balance',
    add: 'Add',
    withdraw: 'Withdraw',
    collect: 'Collect',
    cancel: 'Keep it in',
    earns: 'Earns',
    earnsValue: 'The USYC rate',
    holding: 'Holding for deals',
    ready: 'Ready to withdraw',
    comingBack: 'Coming back',
    comingBackValue: '{amount} USDC on {date}',
    readyToCollect: '{amount} USDC to collect',
    addTitle: 'Add to the guarantee',
    withdrawTitle: 'Withdraw from the guarantee',
    addCta: 'Add {amount} USDC',
    withdrawCta: 'Withdraw {amount} USDC',
    addNote: 'It earns while it sits. Taking it out waits {days} days.',
    withdrawNote: 'Ready to collect on {date}, then it comes back to your balance. It stops backing deals today.',
    fromBalance: 'From your balance, {amount} USDC',
    readyLine: '{amount} USDC ready to withdraw',
    doneAdd: '{amount} USDC added to your guarantee',
    doneWithdraw: '{amount} USDC is on its way back. Collect it on {date}.',
    off: 'The deal guarantee isn’t open on this network yet.',
    earnings: 'Earnings on your guarantee',
  },
  profile: {
    money: 'Money',
    moneyLine: 'Balance, agent, guarantee',
    trading: 'Trading',
    account: 'Account',
    preferences: 'Preferences',
    assistantLine: 'Ask it to do anything you can do here',
    showAmounts: 'Show amounts in',
    moreSettings: 'More settings',
    edit: 'Edit',
  },
};

const fr: MoneyPagesCopy = {
  walletDeposit: "Envoyez des USDC à l'adresse de votre portefeuille. Sur {arc}, ils arrivent dans votre solde. Sur un autre réseau, ils apparaissent sous Depuis votre portefeuille.",
  tabs: { label: 'Argent', balance: 'Solde', agent: 'Agent', guarantee: 'Garantie de transaction' },
  tips: {
    balance: 'L’argent que vous pouvez dépenser maintenant : votre portefeuille, votre solde de transfert et ce qui reste chez votre agent.',
    agent: 'L’argent mis de côté pour votre agent. Il paie les vérifications et la recherche de vendeurs, dans votre limite hebdomadaire. Les accords attendent toujours votre accord.',
    guarantee: 'L’argent mis de côté pour protéger vos acheteurs. Il rapporte pendant qu’il attend. Un accord peut en retenir une partie jusqu’à sa fin. Il n’est pas compté dans votre solde.',
  },
  added: {
    title: '{amount} USDC ajoutés',
    fromLine: 'Depuis {network}, à l’instant',
    from: 'De',
    to: 'Vers',
    yourBalance: 'Votre solde',
    took: 'Durée',
    seconds: '{n} secondes',
    fee: 'Frais de réseau',
    feeWallet: 'Payés dans votre portefeuille',
    done: 'Terminé',
    addMore: 'Ajouter encore',
    allActivity: 'Toute l’activité',
    otherWays: 'Autres moyens',
    freeTest: 'Obtenir des USDC de test gratuits',
  },
  withdraw: {
    title: 'Retirer',
    sendTo: 'Envoyer vers',
    comingSoon: 'Bientôt',
    yourWallet: 'Votre portefeuille',
    anotherWallet: 'Un autre portefeuille ou une plateforme',
    anotherNote: 'Collez une adresse, choisissez le réseau',
    karwan: 'Quelqu’un sur Karwan',
    karwanNote: 'Trouvez-le par son identifiant',
    bank: 'Un compte bancaire',
    card: 'Une carte',
    soon: 'Bientôt',
    address: 'Son adresse',
    badAddress: 'Vérifiez l’adresse. Elle commence par 0x et compte 42 caractères.',
    network: 'Réseau',
    continue: 'Continuer',
    toLine: 'Vers {address} sur {network}',
    ready: '{amount} USDC prêts à retirer',
    elsewhere: '{amount} USDC de plus sont dans votre solde de transfert ou chez votre agent.',
    bringIt: 'Les ramener ici',
    review: 'Vérifier {amount} USDC',
    sentTitle: '{amount} USDC envoyés',
    sentLine: 'Vers {address} sur {network}',
    took: 'Durée',
    another: 'Retirer encore',
  },
  agent: {
    withAgent: 'Chez votre agent',
    line: 'Fait partie de votre solde. Dépense jusqu’à {limit} USDC par semaine en vérifications.',
    topUp: 'Recharger',
    withdraw: 'Retirer',
    changeLimit: 'Changer la limite',
    topUpTitle: 'Recharger votre agent',
    withdrawTitle: 'Retirer de votre agent',
    spentOf: '{spent} sur {limit}',
    leftLine: 'Il reste {left}. {checks} vérifications et {searches} recherches pour l’instant.',
    limitError: 'Votre limite ne s’est pas chargée.',
  },
  guarantee: {
    inPlace: 'En place',
    notCounted: 'Non compté dans votre solde',
    add: 'Ajouter',
    withdraw: 'Retirer',
    collect: 'Récupérer',
    cancel: 'Le garder',
    earns: 'Rapporte',
    earnsValue: 'Le taux USYC',
    holding: 'Retenu pour des accords',
    ready: 'Prêt à retirer',
    comingBack: 'En retour',
    comingBackValue: '{amount} USDC le {date}',
    readyToCollect: '{amount} USDC à récupérer',
    addTitle: 'Ajouter à la garantie',
    withdrawTitle: 'Retirer de la garantie',
    addCta: 'Ajouter {amount} USDC',
    withdrawCta: 'Retirer {amount} USDC',
    addNote: 'Il rapporte pendant qu’il attend. Le retrait demande {days} jours.',
    withdrawNote: 'À récupérer le {date}, puis il revient sur votre solde. Il cesse de couvrir les accords aujourd’hui.',
    fromBalance: 'Depuis votre solde, {amount} USDC',
    readyLine: '{amount} USDC prêts à retirer',
    doneAdd: '{amount} USDC ajoutés à votre garantie',
    doneWithdraw: '{amount} USDC sont en retour. Récupérez-les le {date}.',
    off: 'La garantie de transaction n’est pas encore ouverte sur ce réseau.',
    earnings: 'Gains sur votre garantie',
  },
  profile: {
    money: 'Argent',
    moneyLine: 'Solde, agent, garantie',
    trading: 'Commerce',
    account: 'Compte',
    preferences: 'Préférences',
    assistantLine: 'Demandez-lui tout ce que vous pouvez faire ici',
    showAmounts: 'Afficher les montants en',
    moreSettings: 'Plus de réglages',
    edit: 'Modifier',
  },
};

const ar: MoneyPagesCopy = {
  walletDeposit: 'أرسل USDC إلى عنوان محفظتك. على {arc} تصل إلى رصيدك. على شبكة أخرى تظهر تحت من محفظتك.',
  tabs: { label: 'المال', balance: 'الرصيد', agent: 'الوكيل', guarantee: 'ضمان الصفقة' },
  tips: {
    balance: 'المال الذي يمكنك إنفاقه الآن: محفظتك ورصيد التحويل وما بقي لدى وكيلك.',
    agent: 'مال مخصص لوكيلك. يدفع منه فحوص السجل والبحث عن البائعين، ضمن حدك الأسبوعي. الصفقات تنتظر موافقتك دائمًا.',
    guarantee: 'مال تضعه جانبًا لحماية مشتريك. يربح وهو ينتظر. يمكن لصفقة أن تحجز جزءًا منه حتى تنتهي. لا يُحسب في رصيدك.',
  },
  added: {
    title: 'أُضيف {amount} USDC',
    fromLine: 'من {network}، الآن',
    from: 'من',
    to: 'إلى',
    yourBalance: 'رصيدك',
    took: 'استغرق',
    seconds: '{n} ثانية',
    fee: 'رسوم الشبكة',
    feeWallet: 'دُفعت من محفظتك',
    done: 'تم',
    addMore: 'أضف المزيد',
    allActivity: 'كل النشاط',
    otherWays: 'طرق أخرى',
    freeTest: 'احصل على USDC تجريبي مجانًا',
  },
  withdraw: {
    title: 'سحب',
    sendTo: 'أرسلها إلى',
    comingSoon: 'قريبًا',
    yourWallet: 'محفظتك',
    anotherWallet: 'محفظة أخرى أو منصة تداول',
    anotherNote: 'الصق عنوانًا واختر الشبكة',
    karwan: 'شخص على Karwan',
    karwanNote: 'ابحث عنه بمعرّفه',
    bank: 'حساب بنكي',
    card: 'بطاقة',
    soon: 'قريبًا',
    address: 'عنوانه',
    badAddress: 'تحقق من العنوان. يبدأ بـ 0x ويتكوّن من 42 حرفًا.',
    network: 'الشبكة',
    continue: 'متابعة',
    toLine: 'إلى {address} على {network}',
    ready: '{amount} USDC جاهزة للسحب',
    elsewhere: '{amount} USDC أخرى في رصيد التحويل أو لدى وكيلك.',
    bringIt: 'أحضرها إلى هنا',
    review: 'راجع {amount} USDC',
    sentTitle: 'أُرسل {amount} USDC',
    sentLine: 'إلى {address} على {network}',
    took: 'استغرق',
    another: 'اسحب المزيد',
  },
  agent: {
    withAgent: 'لدى وكيلك',
    line: 'جزء من رصيدك. ينفق حتى {limit} USDC أسبوعيًا على الفحوص.',
    topUp: 'شحن',
    withdraw: 'سحب',
    changeLimit: 'غيّر الحد',
    topUpTitle: 'اشحن وكيلك',
    withdrawTitle: 'اسحب من وكيلك',
    spentOf: '{spent} من {limit}',
    leftLine: 'بقي {left}. {checks} فحص سجل و{searches} بحث حتى الآن.',
    limitError: 'لم يُحمَّل حدّك.',
  },
  guarantee: {
    inPlace: 'قائم',
    notCounted: 'لا تُحسب في رصيدك',
    add: 'أضف',
    withdraw: 'سحب',
    collect: 'استلم',
    cancel: 'أبقِه',
    earns: 'يربح',
    earnsValue: 'سعر USYC',
    holding: 'محجوز للصفقات',
    ready: 'جاهز للسحب',
    comingBack: 'في طريق العودة',
    comingBackValue: '{amount} USDC في {date}',
    readyToCollect: '{amount} USDC للاستلام',
    addTitle: 'أضف إلى الضمان',
    withdrawTitle: 'اسحب من الضمان',
    addCta: 'أضف {amount} USDC',
    withdrawCta: 'اسحب {amount} USDC',
    addNote: 'يربح وهو ينتظر. السحب ينتظر {days} أيام.',
    withdrawNote: 'جاهز للاستلام في {date}، ثم يعود إلى رصيدك. يتوقف عن دعم الصفقات اليوم.',
    fromBalance: 'من رصيدك، {amount} USDC',
    readyLine: '{amount} USDC جاهزة للسحب',
    doneAdd: 'أُضيف {amount} USDC إلى ضمانك',
    doneWithdraw: '{amount} USDC في طريق العودة. استلمها في {date}.',
    off: 'ضمان الصفقة غير متاح على هذه الشبكة بعد.',
    earnings: 'أرباح ضمانك',
  },
  profile: {
    money: 'المال',
    moneyLine: 'الرصيد والوكيل والضمان',
    trading: 'التجارة',
    account: 'الحساب',
    preferences: 'التفضيلات',
    assistantLine: 'اطلب منه أي شيء يمكنك فعله هنا',
    showAmounts: 'اعرض المبالغ بـ',
    moreSettings: 'إعدادات أخرى',
    edit: 'تعديل',
  },
};

const hi: MoneyPagesCopy = {
  walletDeposit: 'अपने वॉलेट पते पर USDC भेजें। {arc} पर यह आपके शेष में आता है। किसी दूसरे नेटवर्क पर यह आपके वॉलेट से के नीचे दिखता है।',
  tabs: { label: 'पैसा', balance: 'शेष', agent: 'एजेंट', guarantee: 'सौदा गारंटी' },
  tips: {
    balance: 'वह पैसा जो आप अभी खर्च कर सकते हैं: आपका वॉलेट, आपका ट्रांसफ़र शेष और जो आपके एजेंट के पास बचा है।',
    agent: 'आपके एजेंट के लिए अलग रखा पैसा। यह रिकॉर्ड जाँच और विक्रेता खोजने का भुगतान करता है, आपकी साप्ताहिक सीमा तक। सौदे हमेशा आपकी हाँ का इंतज़ार करते हैं।',
    guarantee: 'अपने खरीदारों की सुरक्षा के लिए अलग रखा पैसा। रखे रहने पर यह कमाता है। कोई सौदा खत्म होने तक इसका हिस्सा रोक सकता है। यह आपके शेष में नहीं गिना जाता।',
  },
  added: {
    title: '{amount} USDC जोड़े गए',
    fromLine: '{network} से, अभी',
    from: 'से',
    to: 'को',
    yourBalance: 'आपका शेष',
    took: 'समय लगा',
    seconds: '{n} सेकंड',
    fee: 'नेटवर्क शुल्क',
    feeWallet: 'आपके वॉलेट में चुकाया',
    done: 'हो गया',
    addMore: 'और जोड़ें',
    allActivity: 'सारी गतिविधि',
    otherWays: 'दूसरे तरीके',
    freeTest: 'मुफ़्त टेस्ट USDC लें',
  },
  withdraw: {
    title: 'निकालें',
    sendTo: 'इसे भेजें',
    comingSoon: 'जल्द आ रहा है',
    yourWallet: 'आपका वॉलेट',
    anotherWallet: 'दूसरा वॉलेट या एक्सचेंज',
    anotherNote: 'पता चिपकाएँ, नेटवर्क चुनें',
    karwan: 'Karwan पर कोई',
    karwanNote: 'उन्हें उनके टैग से खोजें',
    bank: 'बैंक खाता',
    card: 'कार्ड',
    soon: 'जल्द',
    address: 'उनका पता',
    badAddress: 'पता जाँचें। यह 0x से शुरू होता है और 42 अक्षर का होता है।',
    network: 'नेटवर्क',
    continue: 'आगे बढ़ें',
    toLine: '{network} पर {address} को',
    ready: '{amount} USDC निकालने के लिए तैयार',
    elsewhere: '{amount} USDC और आपके ट्रांसफ़र शेष में या आपके एजेंट के पास है।',
    bringIt: 'इसे यहाँ लाएँ',
    review: '{amount} USDC की समीक्षा करें',
    sentTitle: '{amount} USDC भेजे गए',
    sentLine: '{network} पर {address} को',
    took: 'समय लगा',
    another: 'और निकालें',
  },
  agent: {
    withAgent: 'आपके एजेंट के पास',
    line: 'आपके शेष का हिस्सा। जाँच पर हफ़्ते में {limit} USDC तक खर्च करता है।',
    topUp: 'टॉप अप',
    withdraw: 'निकालें',
    changeLimit: 'सीमा बदलें',
    topUpTitle: 'अपने एजेंट को टॉप अप करें',
    withdrawTitle: 'अपने एजेंट से निकालें',
    spentOf: '{limit} में से {spent}',
    leftLine: '{left} बचा। अब तक {checks} रिकॉर्ड जाँच और {searches} खोज।',
    limitError: 'आपकी सीमा लोड नहीं हुई।',
  },
  guarantee: {
    inPlace: 'लगा हुआ',
    notCounted: 'आपके शेष में नहीं गिना जाता',
    add: 'जोड़ें',
    withdraw: 'निकालें',
    collect: 'प्राप्त करें',
    cancel: 'रहने दें',
    earns: 'कमाता है',
    earnsValue: 'USYC दर',
    holding: 'सौदों के लिए रुका',
    ready: 'निकालने के लिए तैयार',
    comingBack: 'वापस आ रहा है',
    comingBackValue: '{date} को {amount} USDC',
    readyToCollect: '{amount} USDC प्राप्त करने के लिए',
    addTitle: 'गारंटी में जोड़ें',
    withdrawTitle: 'गारंटी से निकालें',
    addCta: '{amount} USDC जोड़ें',
    withdrawCta: '{amount} USDC निकालें',
    addNote: 'रखे रहने पर यह कमाता है। निकालने में {days} दिन लगते हैं।',
    withdrawNote: '{date} को प्राप्त करने के लिए तैयार, फिर यह आपके शेष में लौटता है। आज से यह सौदों को सहारा नहीं देगा।',
    fromBalance: 'आपके शेष से, {amount} USDC',
    readyLine: '{amount} USDC निकालने के लिए तैयार',
    doneAdd: '{amount} USDC आपकी गारंटी में जोड़े गए',
    doneWithdraw: '{amount} USDC वापस आ रहे हैं। उन्हें {date} को प्राप्त करें।',
    off: 'सौदा गारंटी इस नेटवर्क पर अभी खुली नहीं है।',
    earnings: 'आपकी गारंटी की कमाई',
  },
  profile: {
    money: 'पैसा',
    moneyLine: 'शेष, एजेंट, गारंटी',
    trading: 'व्यापार',
    account: 'खाता',
    preferences: 'पसंद',
    assistantLine: 'यहाँ जो कुछ आप कर सकते हैं, उससे कहें',
    showAmounts: 'राशि दिखाएँ',
    moreSettings: 'और सेटिंग्स',
    edit: 'बदलें',
  },
};

const sw: MoneyPagesCopy = {
  walletDeposit: 'Tuma USDC kwenye anwani ya pochi yako. Kwenye {arc} inaingia kwenye salio lako. Kwenye mtandao mwingine inaonekana chini ya Kutoka kwenye pochi yako.',
  tabs: { label: 'Pesa', balance: 'Salio', agent: 'Wakala', guarantee: 'Dhamana ya mkataba' },
  tips: {
    balance: 'Pesa unayoweza kutumia sasa: pochi yako, salio lako la uhamisho na chochote kilichobaki kwa wakala wako.',
    agent: 'Pesa iliyotengwa kwa wakala wako. Inalipia ukaguzi wa rekodi na kutafuta wauzaji, hadi kikomo chako cha wiki. Mikataba husubiri ridhaa yako kila wakati.',
    guarantee: 'Pesa unayotenga kulinda wanunuzi wako. Inapata faida ikiwa imekaa. Mkataba unaweza kushikilia sehemu yake hadi uishe. Haihesabiwi kwenye salio lako.',
  },
  added: {
    title: 'USDC {amount} zimeongezwa',
    fromLine: 'Kutoka {network}, sasa hivi',
    from: 'Kutoka',
    to: 'Kwenda',
    yourBalance: 'Salio lako',
    took: 'Ilichukua',
    seconds: 'sekunde {n}',
    fee: 'Ada ya mtandao',
    feeWallet: 'Imelipwa kwenye pochi yako',
    done: 'Sawa',
    addMore: 'Ongeza zaidi',
    allActivity: 'Shughuli zote',
    otherWays: 'Njia nyingine',
    freeTest: 'Pata USDC za majaribio bure',
  },
  withdraw: {
    title: 'Toa',
    sendTo: 'Itume kwa',
    comingSoon: 'Inakuja hivi karibuni',
    yourWallet: 'Pochi yako',
    anotherWallet: 'Pochi nyingine au soko la kubadilisha',
    anotherNote: 'Bandika anwani, chagua mtandao',
    karwan: 'Mtu aliye Karwan',
    karwanNote: 'Mtafute kwa lebo yake',
    bank: 'Akaunti ya benki',
    card: 'Kadi',
    soon: 'Hivi karibuni',
    address: 'Anwani yake',
    badAddress: 'Kagua anwani. Inaanza na 0x na ina herufi 42.',
    network: 'Mtandao',
    continue: 'Endelea',
    toLine: 'Kwa {address} kwenye {network}',
    ready: 'USDC {amount} tayari kutolewa',
    elsewhere: 'USDC {amount} zaidi ziko kwenye salio la uhamisho au kwa wakala wako.',
    bringIt: 'Zilete hapa',
    review: 'Kagua USDC {amount}',
    sentTitle: 'USDC {amount} zimetumwa',
    sentLine: 'Kwa {address} kwenye {network}',
    took: 'Ilichukua',
    another: 'Toa zaidi',
  },
  agent: {
    withAgent: 'Kwa wakala wako',
    line: 'Sehemu ya salio lako. Hutumia hadi USDC {limit} kwa wiki kwa ukaguzi.',
    topUp: 'Ongeza',
    withdraw: 'Toa',
    changeLimit: 'Badilisha kikomo',
    topUpTitle: 'Mwongezee wakala wako',
    withdrawTitle: 'Toa kutoka kwa wakala wako',
    spentOf: '{spent} kati ya {limit}',
    leftLine: 'Zimebaki {left}. Ukaguzi {checks} wa rekodi na utafutaji {searches} hadi sasa.',
    limitError: 'Kikomo chako hakijapakia.',
  },
  guarantee: {
    inPlace: 'Imewekwa',
    notCounted: 'Haihesabiwi kwenye salio lako',
    add: 'Ongeza',
    withdraw: 'Toa',
    collect: 'Kusanya',
    cancel: 'Iache ibaki',
    earns: 'Inapata',
    earnsValue: 'Kiwango cha USYC',
    holding: 'Imeshikiliwa kwa mikataba',
    ready: 'Tayari kutolewa',
    comingBack: 'Zinarudi',
    comingBackValue: 'USDC {amount} tarehe {date}',
    readyToCollect: 'USDC {amount} za kukusanya',
    addTitle: 'Ongeza kwenye dhamana',
    withdrawTitle: 'Toa kwenye dhamana',
    addCta: 'Ongeza USDC {amount}',
    withdrawCta: 'Toa USDC {amount}',
    addNote: 'Inapata faida ikiwa imekaa. Kuitoa husubiri siku {days}.',
    withdrawNote: 'Tayari kukusanywa tarehe {date}, kisha inarudi kwenye salio lako. Inaacha kulinda mikataba leo.',
    fromBalance: 'Kutoka salio lako, USDC {amount}',
    readyLine: 'USDC {amount} tayari kutolewa',
    doneAdd: 'USDC {amount} zimeongezwa kwenye dhamana yako',
    doneWithdraw: 'USDC {amount} zinarudi. Zikusanye tarehe {date}.',
    off: 'Dhamana ya mkataba bado haijafunguliwa kwenye mtandao huu.',
    earnings: 'Mapato ya dhamana yako',
  },
  profile: {
    money: 'Pesa',
    moneyLine: 'Salio, wakala, dhamana',
    trading: 'Biashara',
    account: 'Akaunti',
    preferences: 'Mapendeleo',
    assistantLine: 'Muombe chochote unachoweza kufanya hapa',
    showAmounts: 'Onyesha kiasi kwa',
    moreSettings: 'Mipangilio zaidi',
    edit: 'Hariri',
  },
};

export const moneyPagesCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', MoneyPagesCopy> = { en, fr, ar, hi, sw };
