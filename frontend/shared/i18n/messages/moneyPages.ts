/// Words for view 51, fourth and fifth rounds: Add money and Withdraw as pages,
/// the card that stays until Done, one Money page with Balance, Agent and Deal
/// guarantee, and the tidy Profile. Explanations sit behind info tips.
export interface MoneyPagesCopy {
  tabs: { label: string; balance: string; agent: string; guarantee: string };
  /// From an exchange, for an account that signs with its own wallet.
  walletDeposit: string;
  /// From an exchange in three steps (owner, 9 Nov 2026, Figma 228:641).
  walletSteps: { pick: string; pickNote: string; send: string; onlyUsdc: string; wait: string; watching: string; qrAlt: string };
  tips: { balance: string; agent: string; guarantee: string };
  /// Shown once under the balance on a first visit; Got it is remembered (owner, 9 Nov 2026, Figma 218:604).
  firstVisit: string;
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
  walletSteps: { pick: "1  On the exchange, pick USDC on {arc}", pickNote: "On {arc} it lands in your balance in seconds. On another network it waits under From your wallet, and you add it with one tap.", send: "2  Send it to this address", onlyUsdc: "Only USDC, on the network you picked. Other coins are not added.", wait: "3  We tell you when it lands", watching: "Watching for your money…", qrAlt: "QR code of your wallet address" },
  tabs: { label: 'Money', balance: 'Balance', agent: 'Agent', guarantee: 'Savings pocket' },
  firstVisit: 'This is the money you can use. Money held in a deal shows on the deal until it is released.',
  tips: {
    balance: 'Money you can spend now: your wallet, your Transfer balance and anything still with your agent.',
    agent: 'Money set aside for your agent. It pays for record checks and finding sellers, up to your weekly limit. Deals always wait for your OK.',
    guarantee: 'Money you keep aside. It earns at the rate of US Treasury bills, paid by Karwan on testnet. A buyer can ask you to back a deal with it, and that part waits until the deal ends. It isn’t counted in your balance.',
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
    inPlace: 'In your pocket',
    notCounted: 'Not counted in your balance',
    add: 'Add to pocket',
    withdraw: 'Take out',
    collect: 'Collect',
    cancel: 'Keep it in',
    earns: 'Earns',
    earnsValue: 'The US Treasury bill rate',
    holding: 'Backing deals',
    ready: 'Free',
    comingBack: 'Coming back',
    comingBackValue: '{amount} USDC on {date}',
    readyToCollect: '{amount} USDC to collect',
    addTitle: 'Add to your savings pocket',
    withdrawTitle: 'Take out of your savings pocket',
    addCta: 'Add {amount} USDC',
    withdrawCta: 'Take out {amount} USDC',
    addNote: 'It earns while it sits. Taking it out waits {days} days.',
    withdrawNote: 'Ready to collect on {date}, then it comes back to your balance. It stops backing deals today.',
    fromBalance: 'From your balance, {amount} USDC',
    readyLine: '{amount} USDC free',
    doneAdd: '{amount} USDC added to your savings pocket',
    doneWithdraw: '{amount} USDC is on its way back. Collect it on {date}.',
    off: 'The savings pocket isn’t open on this network yet.',
    earnings: 'Earned in your pocket',
  },
  profile: {
    money: 'Money',
    moneyLine: 'Balance, agent, savings pocket',
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
  walletSteps: { pick: "1  Sur la plateforme, choisissez USDC sur {arc}", pickNote: "Sur {arc}, ils arrivent dans votre solde en quelques secondes. Sur un autre réseau, ils attendent sous Depuis votre portefeuille, et vous les ajoutez en un geste.", send: "2  Envoyez-les à cette adresse", onlyUsdc: "Uniquement des USDC, sur le réseau choisi. Les autres jetons ne sont pas ajoutés.", wait: "3  Nous vous prévenons à leur arrivée", watching: "Nous surveillons votre argent…", qrAlt: "QR code de l’adresse de votre portefeuille" },
  tabs: { label: 'Argent', balance: 'Solde', agent: 'Agent', guarantee: 'Poche d’épargne' },
  firstVisit: 'Voici l’argent que vous pouvez utiliser. L’argent bloqué dans une transaction apparaît sur la transaction jusqu’à sa libération.',
  tips: {
    balance: 'L’argent que vous pouvez dépenser maintenant : votre portefeuille, votre solde de transfert et ce qui reste chez votre agent.',
    agent: 'L’argent mis de côté pour votre agent. Il paie les vérifications et la recherche de vendeurs, dans votre limite hebdomadaire. Les accords attendent toujours votre accord.',
    guarantee: 'L’argent que vous mettez de côté. Il rapporte au taux des bons du Trésor américain, payé par Karwan sur le réseau de test. Un acheteur peut vous demander de couvrir un accord avec, et cette part attend la fin de l’accord. Il n’est pas compté dans votre solde.',
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
    inPlace: 'Dans votre poche',
    notCounted: 'Non compté dans votre solde',
    add: 'Ajouter à la poche',
    withdraw: 'Retirer',
    collect: 'Récupérer',
    cancel: 'Le garder',
    earns: 'Rapporte',
    earnsValue: 'Le taux des bons du Trésor américain',
    holding: 'Couvre des accords',
    ready: 'Libre',
    comingBack: 'En retour',
    comingBackValue: '{amount} USDC le {date}',
    readyToCollect: '{amount} USDC à récupérer',
    addTitle: 'Ajouter à votre poche d’épargne',
    withdrawTitle: 'Retirer de votre poche d’épargne',
    addCta: 'Ajouter {amount} USDC',
    withdrawCta: 'Retirer {amount} USDC',
    addNote: 'Il rapporte pendant qu’il attend. Le retrait demande {days} jours.',
    withdrawNote: 'À récupérer le {date}, puis il revient sur votre solde. Il cesse de couvrir les accords aujourd’hui.',
    fromBalance: 'Depuis votre solde, {amount} USDC',
    readyLine: '{amount} USDC libres',
    doneAdd: '{amount} USDC ajoutés à votre poche d’épargne',
    doneWithdraw: '{amount} USDC sont en retour. Récupérez-les le {date}.',
    off: 'La poche d’épargne n’est pas encore ouverte sur ce réseau.',
    earnings: 'Gains de votre poche',
  },
  profile: {
    money: 'Argent',
    moneyLine: 'Solde, agent, poche d’épargne',
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
  walletSteps: { pick: "1  في المنصة، اختر USDC على {arc}", pickNote: "على {arc} يصل إلى رصيدك خلال ثوانٍ. على شبكة أخرى ينتظر تحت من محفظتك، وتضيفه بلمسة واحدة.", send: "2  أرسله إلى هذا العنوان", onlyUsdc: "USDC فقط، على الشبكة التي اخترتها. العملات الأخرى لا تُضاف.", wait: "3  نخبرك عند وصوله", watching: "نراقب وصول أموالك…", qrAlt: "رمز QR لعنوان محفظتك" },
  tabs: { label: 'المال', balance: 'الرصيد', agent: 'الوكيل', guarantee: 'جيب الادخار' },
  firstVisit: 'هذا هو المال الذي يمكنك استخدامه. المال المحجوز في صفقة يظهر في الصفقة حتى يُفرج عنه.',
  tips: {
    balance: 'المال الذي يمكنك إنفاقه الآن: محفظتك ورصيد التحويل وما بقي لدى وكيلك.',
    agent: 'مال مخصص لوكيلك. يدفع منه فحوص السجل والبحث عن البائعين، ضمن حدك الأسبوعي. الصفقات تنتظر موافقتك دائمًا.',
    guarantee: 'مال تضعه جانبًا. يربح بسعر سندات الخزانة الأمريكية، وتدفعه كاروان على شبكة الاختبار. يمكن للمشتري أن يطلب منك ضمان صفقة به، ويبقى ذلك الجزء حتى تنتهي الصفقة. لا يُحسب في رصيدك.',
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
    inPlace: 'في جيبك',
    notCounted: 'لا تُحسب في رصيدك',
    add: 'أضف إلى الجيب',
    withdraw: 'اسحب',
    collect: 'استلم',
    cancel: 'أبقِه',
    earns: 'يربح',
    earnsValue: 'سعر سندات الخزانة الأمريكية',
    holding: 'يضمن صفقات',
    ready: 'متاح',
    comingBack: 'في طريق العودة',
    comingBackValue: '{amount} USDC في {date}',
    readyToCollect: '{amount} USDC للاستلام',
    addTitle: 'أضف إلى جيب الادخار',
    withdrawTitle: 'اسحب من جيب الادخار',
    addCta: 'أضف {amount} USDC',
    withdrawCta: 'اسحب {amount} USDC',
    addNote: 'يربح وهو ينتظر. السحب ينتظر {days} أيام.',
    withdrawNote: 'جاهز للاستلام في {date}، ثم يعود إلى رصيدك. يتوقف عن دعم الصفقات اليوم.',
    fromBalance: 'من رصيدك، {amount} USDC',
    readyLine: '{amount} USDC متاحة',
    doneAdd: 'أُضيف {amount} USDC إلى جيب الادخار',
    doneWithdraw: '{amount} USDC في طريق العودة. استلمها في {date}.',
    off: 'جيب الادخار غير متاح على هذه الشبكة بعد.',
    earnings: 'أرباح جيبك',
  },
  profile: {
    money: 'المال',
    moneyLine: 'الرصيد والوكيل وجيب الادخار',
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
  walletSteps: { pick: "1  एक्सचेंज पर {arc} पर USDC चुनें", pickNote: "{arc} पर यह कुछ सेकंड में आपके शेष में आता है। किसी दूसरे नेटवर्क पर यह आपके वॉलेट से के नीचे रुकता है, और आप इसे एक टैप में जोड़ते हैं।", send: "2  इसे इस पते पर भेजें", onlyUsdc: "केवल USDC, आपके चुने नेटवर्क पर। दूसरे कॉइन नहीं जोड़े जाते।", wait: "3  पहुँचते ही हम आपको बताएँगे", watching: "आपके पैसे पर नज़र है…", qrAlt: "आपके वॉलेट पते का QR कोड" },
  tabs: { label: 'पैसा', balance: 'शेष', agent: 'एजेंट', guarantee: 'बचत पॉकेट' },
  firstVisit: 'यह वह पैसा है जिसे आप इस्तेमाल कर सकते हैं। किसी सौदे में रुका पैसा उस सौदे पर दिखता है, जब तक वह जारी नहीं हो जाता।',
  tips: {
    balance: 'वह पैसा जो आप अभी खर्च कर सकते हैं: आपका वॉलेट, आपका ट्रांसफ़र शेष और जो आपके एजेंट के पास बचा है।',
    agent: 'आपके एजेंट के लिए अलग रखा पैसा। यह रिकॉर्ड जाँच और विक्रेता खोजने का भुगतान करता है, आपकी साप्ताहिक सीमा तक। सौदे हमेशा आपकी हाँ का इंतज़ार करते हैं।',
    guarantee: 'अलग रखा आपका पैसा। यह अमेरिकी ट्रेज़री बिल की दर से कमाता है, जो टेस्टनेट पर Karwan देता है। कोई खरीदार आपसे इससे किसी सौदे को सहारा देने को कह सकता है, और वह हिस्सा सौदा खत्म होने तक रुका रहता है। यह आपके शेष में नहीं गिना जाता।',
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
    inPlace: 'आपकी पॉकेट में',
    notCounted: 'आपके शेष में नहीं गिना जाता',
    add: 'पॉकेट में जोड़ें',
    withdraw: 'निकालें',
    collect: 'प्राप्त करें',
    cancel: 'रहने दें',
    earns: 'कमाता है',
    earnsValue: 'अमेरिकी ट्रेज़री बिल की दर',
    holding: 'सौदों को सहारा',
    ready: 'खाली',
    comingBack: 'वापस आ रहा है',
    comingBackValue: '{date} को {amount} USDC',
    readyToCollect: '{amount} USDC प्राप्त करने के लिए',
    addTitle: 'बचत पॉकेट में जोड़ें',
    withdrawTitle: 'बचत पॉकेट से निकालें',
    addCta: '{amount} USDC जोड़ें',
    withdrawCta: '{amount} USDC निकालें',
    addNote: 'रखे रहने पर यह कमाता है। निकालने में {days} दिन लगते हैं।',
    withdrawNote: '{date} को प्राप्त करने के लिए तैयार, फिर यह आपके शेष में लौटता है। आज से यह सौदों को सहारा नहीं देगा।',
    fromBalance: 'आपके शेष से, {amount} USDC',
    readyLine: '{amount} USDC खाली',
    doneAdd: '{amount} USDC आपकी बचत पॉकेट में जोड़े गए',
    doneWithdraw: '{amount} USDC वापस आ रहे हैं। उन्हें {date} को प्राप्त करें।',
    off: 'बचत पॉकेट इस नेटवर्क पर अभी खुली नहीं है।',
    earnings: 'आपकी पॉकेट की कमाई',
  },
  profile: {
    money: 'पैसा',
    moneyLine: 'शेष, एजेंट, बचत पॉकेट',
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
  walletSteps: { pick: "1  Kwenye soko, chagua USDC kwenye {arc}", pickNote: "Kwenye {arc} inaingia kwenye salio lako kwa sekunde. Kwenye mtandao mwingine inasubiri chini ya Kutoka kwenye pochi yako, na unaiongeza kwa mguso mmoja.", send: "2  Itume kwenye anwani hii", onlyUsdc: "USDC pekee, kwenye mtandao uliochagua. Sarafu nyingine haziongezwi.", wait: "3  Tutakuambia ikifika", watching: "Tunafuatilia pesa zako…", qrAlt: "Msimbo wa QR wa anwani ya pochi yako" },
  tabs: { label: 'Pesa', balance: 'Salio', agent: 'Wakala', guarantee: 'Mfuko wa akiba' },
  firstVisit: 'Hii ndiyo pesa unayoweza kutumia. Pesa iliyoshikiliwa kwenye mpango inaonekana kwenye mpango huo hadi itakapotolewa.',
  tips: {
    balance: 'Pesa unayoweza kutumia sasa: pochi yako, salio lako la uhamisho na chochote kilichobaki kwa wakala wako.',
    agent: 'Pesa iliyotengwa kwa wakala wako. Inalipia ukaguzi wa rekodi na kutafuta wauzaji, hadi kikomo chako cha wiki. Mikataba husubiri ridhaa yako kila wakati.',
    guarantee: 'Pesa unazoweka kando. Zinapata faida kwa kiwango cha hati fungani za Hazina ya Marekani, zinazolipwa na Karwan kwenye mtandao wa majaribio. Mnunuzi anaweza kukuomba udhamini mkataba kwazo, na sehemu hiyo husubiri hadi mkataba uishe. Hazihesabiwi kwenye salio lako.',
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
    inPlace: 'Kwenye mfuko wako',
    notCounted: 'Haihesabiwi kwenye salio lako',
    add: 'Ongeza kwenye mfuko',
    withdraw: 'Toa',
    collect: 'Kusanya',
    cancel: 'Iache ibaki',
    earns: 'Inapata',
    earnsValue: 'Kiwango cha hati za Hazina ya Marekani',
    holding: 'Zinadhamini mikataba',
    ready: 'Huru',
    comingBack: 'Zinarudi',
    comingBackValue: 'USDC {amount} tarehe {date}',
    readyToCollect: 'USDC {amount} za kukusanya',
    addTitle: 'Ongeza kwenye mfuko wa akiba',
    withdrawTitle: 'Toa kwenye mfuko wa akiba',
    addCta: 'Ongeza USDC {amount}',
    withdrawCta: 'Toa USDC {amount}',
    addNote: 'Inapata faida ikiwa imekaa. Kuitoa husubiri siku {days}.',
    withdrawNote: 'Tayari kukusanywa tarehe {date}, kisha inarudi kwenye salio lako. Inaacha kulinda mikataba leo.',
    fromBalance: 'Kutoka salio lako, USDC {amount}',
    readyLine: 'USDC {amount} huru',
    doneAdd: 'USDC {amount} zimeongezwa kwenye mfuko wako wa akiba',
    doneWithdraw: 'USDC {amount} zinarudi. Zikusanye tarehe {date}.',
    off: 'Mfuko wa akiba bado haujafunguliwa kwenye mtandao huu.',
    earnings: 'Mapato ya mfuko wako',
  },
  profile: {
    money: 'Pesa',
    moneyLine: 'Salio, wakala, mfuko wa akiba',
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
