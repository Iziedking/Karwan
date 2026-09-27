/// Passkey recovery copy, all five locales. Plain, sentence case, no em dashes.
export type RecoveryCopy = {
  step: {
    title: string;
    body: string;
    label: string;
    show: string;
    hide: string;
    tip: string;
    save: string;
    saving: string;
    skip: string;
    failed: string;
    weak: { short: string; common: string; repeated: string };
  };
  row: {
    title: string;
    setUp: string;
    setUpBody: string;
    off: string;
    offBody: string;
    turnOn: string;
    lowBalance: string;
    on: string;
    onBody: string;
    waiting: string;
    waitingBody: string;
    cancel: string;
    cancelling: string;
    cancelled: string;
  };
  sheet: {
    title: string;
    what: string;
    fee: string;
    feeValue: string;
    undo: string;
    password: string;
    confirm: string;
    working: string;
    done: string;
    wrong: string;
    failed: string;
    close: string;
  };
  flow: {
    entry: string;
    title: string;
    intro: string;
    email: string;
    sendCode: string;
    sending: string;
    code: string;
    codeSent: string;
    continue: string;
    checking: string;
    password: string;
    start: string;
    waitingTitle: string;
    waitingBody: string;
    tooEarly: string;
    wrong: string;
    locked: string;
    neverOn: string;
    readyTitle: string;
    readyBody: string;
    createPasskey: string;
    working: string;
    doneTitle: string;
    doneBody: string;
    openWallet: string;
    wrongCode: string;
    expired: string;
    failed: string;
    back: string;
  };
  cancelPage: {
    title: string;
    body: string;
    cancel: string;
    cancelling: string;
    done: string;
    doneBody: string;
    invalid: string;
  };
};

const en: RecoveryCopy = {
  step: {
    title: 'Set a recovery password',
    body: "If you lose your passkey, this password and your email get you back in. We can't reset it for you.",
    label: 'Recovery password',
    show: 'Show',
    hide: 'Hide',
    tip: "A short sentence you'll remember works well.",
    save: 'Save recovery password',
    saving: 'Saving',
    skip: 'Not now',
    failed: "We couldn't save it. Try again.",
    weak: { short: 'Use at least 12 characters.', common: 'Avoid common passwords.', repeated: 'Use more than one or two different characters.' },
  },
  row: {
    title: 'Recovery',
    setUp: 'Set a recovery password',
    setUpBody: 'Without one, losing your passkey means losing this wallet.',
    off: 'Not on yet',
    offBody: 'Turn it on so your recovery password can restore this wallet.',
    turnOn: 'Turn on',
    lowBalance: 'Add a little USDC first to pay the network fee.',
    on: 'On',
    onBody: 'Your email and recovery password can restore this wallet.',
    waiting: 'A recovery is in progress',
    waitingBody: "It can finish on {date}. If this wasn't you, cancel it.",
    cancel: 'Cancel recovery',
    cancelling: 'Cancelling',
    cancelled: 'Recovery cancelled',
  },
  sheet: {
    title: 'Turn on recovery',
    what: 'Lets your email and recovery password restore this wallet if you lose your passkey.',
    fee: 'Network fee',
    feeValue: 'Up to {amount} USDC',
    undo: 'This stays on for this wallet.',
    password: 'Recovery password',
    confirm: 'Turn on recovery',
    working: 'Turning on',
    done: 'Recovery is on',
    wrong: "That password doesn't match.",
    failed: "It didn't finish. Try again.",
    close: 'Close',
  },
  flow: {
    entry: 'Lost your passkey?',
    title: 'Recover your wallet',
    intro: "We'll email you a code. Then you'll enter your recovery password.",
    email: 'Email',
    sendCode: 'Send code',
    sending: 'Sending',
    code: 'Code',
    codeSent: 'Enter the 6-digit code we sent to {email}.',
    continue: 'Continue',
    checking: 'Checking',
    password: 'Recovery password',
    start: 'Start recovery',
    waitingTitle: 'Recovery started',
    waitingBody: "You can finish on {date}. We've emailed you. If this wasn't you, cancel from the email.",
    tooEarly: 'Recovery is in progress. You can finish on {date}.',
    wrong: "That password doesn't match. {n} tries left today.",
    locked: 'Too many tries. Try again after {date}.',
    neverOn: "Recovery was never turned on for this wallet, so it can't be recovered here. Write to support@karwan.site.",
    readyTitle: 'Set up a new passkey',
    readyBody: 'Enter your recovery password. Then your device will ask you to create a passkey.',
    createPasskey: 'Create new passkey',
    working: 'Recovering your wallet',
    doneTitle: "You're back in",
    doneBody: 'Your wallet now works with this passkey.',
    openWallet: 'Open your wallet',
    wrongCode: 'That code did not work. Check it and try again.',
    expired: 'That step timed out. Start again.',
    failed: 'Something went wrong. Try again.',
    back: 'Back to sign in',
  },
  cancelPage: {
    title: 'Cancel recovery',
    body: 'This stops the recovery request for your wallet. Nothing else changes.',
    cancel: 'Cancel recovery',
    cancelling: 'Cancelling',
    done: 'Recovery cancelled',
    doneBody: 'Your wallet stays as it was.',
    invalid: 'This link has expired or was already used.',
  },
};

const ar: RecoveryCopy = {
  step: {
    title: 'عيّن كلمة مرور للاسترداد',
    body: 'إذا فقدت مفتاح المرور، تعيدك كلمة المرور هذه وبريدك الإلكتروني إلى محفظتك. لا يمكننا إعادة تعيينها لك.',
    label: 'كلمة مرور الاسترداد',
    show: 'إظهار',
    hide: 'إخفاء',
    tip: 'جملة قصيرة تتذكرها تكفي.',
    save: 'احفظ كلمة مرور الاسترداد',
    saving: 'جارٍ الحفظ',
    skip: 'ليس الآن',
    failed: 'تعذّر الحفظ. حاول مرة أخرى.',
    weak: { short: 'استخدم 12 حرفًا على الأقل.', common: 'تجنّب كلمات المرور الشائعة.', repeated: 'استخدم أكثر من حرف أو حرفين مختلفين.' },
  },
  row: {
    title: 'الاسترداد',
    setUp: 'عيّن كلمة مرور للاسترداد',
    setUpBody: 'بدونها، فقدان مفتاح المرور يعني فقدان هذه المحفظة.',
    off: 'غير مفعّل بعد',
    offBody: 'فعّله لتتمكن كلمة مرور الاسترداد من استعادة هذه المحفظة.',
    turnOn: 'تفعيل',
    lowBalance: 'أضف قليلًا من USDC أولًا لدفع رسوم الشبكة.',
    on: 'مفعّل',
    onBody: 'يمكن لبريدك وكلمة مرور الاسترداد استعادة هذه المحفظة.',
    waiting: 'هناك عملية استرداد جارية',
    waitingBody: 'يمكن أن تكتمل في {date}. إذا لم تكن أنت، ألغها.',
    cancel: 'إلغاء الاسترداد',
    cancelling: 'جارٍ الإلغاء',
    cancelled: 'تم إلغاء الاسترداد',
  },
  sheet: {
    title: 'تفعيل الاسترداد',
    what: 'يسمح لبريدك وكلمة مرور الاسترداد باستعادة هذه المحفظة إذا فقدت مفتاح المرور.',
    fee: 'رسوم الشبكة',
    feeValue: 'حتى {amount} USDC',
    undo: 'يبقى هذا مفعّلًا لهذه المحفظة.',
    password: 'كلمة مرور الاسترداد',
    confirm: 'تفعيل الاسترداد',
    working: 'جارٍ التفعيل',
    done: 'الاسترداد مفعّل',
    wrong: 'كلمة المرور غير مطابقة.',
    failed: 'لم تكتمل العملية. حاول مرة أخرى.',
    close: 'إغلاق',
  },
  flow: {
    entry: 'فقدت مفتاح المرور؟',
    title: 'استرداد محفظتك',
    intro: 'سنرسل لك رمزًا بالبريد. ثم تُدخل كلمة مرور الاسترداد.',
    email: 'البريد الإلكتروني',
    sendCode: 'أرسل الرمز',
    sending: 'جارٍ الإرسال',
    code: 'الرمز',
    codeSent: 'أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى {email}.',
    continue: 'متابعة',
    checking: 'جارٍ التحقق',
    password: 'كلمة مرور الاسترداد',
    start: 'ابدأ الاسترداد',
    waitingTitle: 'بدأ الاسترداد',
    waitingBody: 'يمكنك الإكمال في {date}. أرسلنا لك بريدًا. إذا لم تكن أنت، ألغِ من البريد.',
    tooEarly: 'الاسترداد جارٍ. يمكنك الإكمال في {date}.',
    wrong: 'كلمة المرور غير مطابقة. تبقّى لك {n} محاولات اليوم.',
    locked: 'محاولات كثيرة. حاول مرة أخرى بعد {date}.',
    neverOn: 'لم يُفعَّل الاسترداد لهذه المحفظة، لذا لا يمكن استعادتها هنا. راسل support@karwan.site.',
    readyTitle: 'أنشئ مفتاح مرور جديدًا',
    readyBody: 'أدخل كلمة مرور الاسترداد. ثم سيطلب منك جهازك إنشاء مفتاح مرور.',
    createPasskey: 'إنشاء مفتاح مرور جديد',
    working: 'جارٍ استرداد محفظتك',
    doneTitle: 'عدت إلى محفظتك',
    doneBody: 'تعمل محفظتك الآن بمفتاح المرور هذا.',
    openWallet: 'افتح محفظتك',
    wrongCode: 'الرمز غير صحيح. تحقّق منه وحاول مرة أخرى.',
    expired: 'انتهت مهلة هذه الخطوة. ابدأ من جديد.',
    failed: 'حدث خطأ. حاول مرة أخرى.',
    back: 'العودة إلى تسجيل الدخول',
  },
  cancelPage: {
    title: 'إلغاء الاسترداد',
    body: 'يوقف هذا طلب استرداد محفظتك. لا يتغيّر شيء آخر.',
    cancel: 'إلغاء الاسترداد',
    cancelling: 'جارٍ الإلغاء',
    done: 'تم إلغاء الاسترداد',
    doneBody: 'تبقى محفظتك كما هي.',
    invalid: 'انتهت صلاحية هذا الرابط أو استُخدم من قبل.',
  },
};

const fr: RecoveryCopy = {
  step: {
    title: 'Définissez un mot de passe de récupération',
    body: 'Si vous perdez votre clé d’accès, ce mot de passe et votre e-mail vous permettent de revenir. Nous ne pouvons pas le réinitialiser pour vous.',
    label: 'Mot de passe de récupération',
    show: 'Afficher',
    hide: 'Masquer',
    tip: 'Une courte phrase dont vous vous souviendrez fait l’affaire.',
    save: 'Enregistrer le mot de passe',
    saving: 'Enregistrement',
    skip: 'Plus tard',
    failed: 'L’enregistrement a échoué. Réessayez.',
    weak: { short: 'Utilisez au moins 12 caractères.', common: 'Évitez les mots de passe courants.', repeated: 'Utilisez plus d’un ou deux caractères différents.' },
  },
  row: {
    title: 'Récupération',
    setUp: 'Définir un mot de passe de récupération',
    setUpBody: 'Sans lui, perdre votre clé d’accès signifie perdre ce portefeuille.',
    off: 'Pas encore activée',
    offBody: 'Activez-la pour que votre mot de passe de récupération puisse restaurer ce portefeuille.',
    turnOn: 'Activer',
    lowBalance: 'Ajoutez d’abord un peu d’USDC pour payer les frais de réseau.',
    on: 'Activée',
    onBody: 'Votre e-mail et votre mot de passe de récupération peuvent restaurer ce portefeuille.',
    waiting: 'Une récupération est en cours',
    waitingBody: 'Elle peut se terminer le {date}. Si ce n’est pas vous, annulez-la.',
    cancel: 'Annuler la récupération',
    cancelling: 'Annulation',
    cancelled: 'Récupération annulée',
  },
  sheet: {
    title: 'Activer la récupération',
    what: 'Permet à votre e-mail et à votre mot de passe de récupération de restaurer ce portefeuille si vous perdez votre clé d’accès.',
    fee: 'Frais de réseau',
    feeValue: 'Jusqu’à {amount} USDC',
    undo: 'Cela reste activé pour ce portefeuille.',
    password: 'Mot de passe de récupération',
    confirm: 'Activer la récupération',
    working: 'Activation',
    done: 'La récupération est activée',
    wrong: 'Ce mot de passe ne correspond pas.',
    failed: 'L’opération n’a pas abouti. Réessayez.',
    close: 'Fermer',
  },
  flow: {
    entry: 'Clé d’accès perdue ?',
    title: 'Récupérer votre portefeuille',
    intro: 'Nous vous envoyons un code par e-mail. Ensuite, saisissez votre mot de passe de récupération.',
    email: 'E-mail',
    sendCode: 'Envoyer le code',
    sending: 'Envoi',
    code: 'Code',
    codeSent: 'Saisissez le code à 6 chiffres envoyé à {email}.',
    continue: 'Continuer',
    checking: 'Vérification',
    password: 'Mot de passe de récupération',
    start: 'Lancer la récupération',
    waitingTitle: 'Récupération lancée',
    waitingBody: 'Vous pourrez terminer le {date}. Nous vous avons écrit. Si ce n’est pas vous, annulez depuis l’e-mail.',
    tooEarly: 'La récupération est en cours. Vous pourrez terminer le {date}.',
    wrong: 'Ce mot de passe ne correspond pas. Il reste {n} essais aujourd’hui.',
    locked: 'Trop d’essais. Réessayez après le {date}.',
    neverOn: 'La récupération n’a jamais été activée pour ce portefeuille, il ne peut donc pas être récupéré ici. Écrivez à support@karwan.site.',
    readyTitle: 'Créez une nouvelle clé d’accès',
    readyBody: 'Saisissez votre mot de passe de récupération. Ensuite, votre appareil vous demandera de créer une clé d’accès.',
    createPasskey: 'Créer une nouvelle clé d’accès',
    working: 'Récupération du portefeuille',
    doneTitle: 'Vous êtes de retour',
    doneBody: 'Votre portefeuille fonctionne maintenant avec cette clé d’accès.',
    openWallet: 'Ouvrir votre portefeuille',
    wrongCode: 'Ce code n’a pas fonctionné. Vérifiez-le et réessayez.',
    expired: 'Cette étape a expiré. Recommencez.',
    failed: 'Un problème est survenu. Réessayez.',
    back: 'Retour à la connexion',
  },
  cancelPage: {
    title: 'Annuler la récupération',
    body: 'Cela arrête la demande de récupération de votre portefeuille. Rien d’autre ne change.',
    cancel: 'Annuler la récupération',
    cancelling: 'Annulation',
    done: 'Récupération annulée',
    doneBody: 'Votre portefeuille reste tel quel.',
    invalid: 'Ce lien a expiré ou a déjà été utilisé.',
  },
};

const hi: RecoveryCopy = {
  step: {
    title: 'रिकवरी पासवर्ड सेट करें',
    body: 'अगर आपकी पासकी खो जाए, तो यह पासवर्ड और आपका ईमेल आपको वापस लाते हैं। हम इसे आपके लिए रीसेट नहीं कर सकते।',
    label: 'रिकवरी पासवर्ड',
    show: 'दिखाएँ',
    hide: 'छिपाएँ',
    tip: 'याद रहने वाला एक छोटा वाक्य अच्छा रहता है।',
    save: 'रिकवरी पासवर्ड सहेजें',
    saving: 'सहेजा जा रहा है',
    skip: 'अभी नहीं',
    failed: 'हम इसे सहेज नहीं पाए। फिर कोशिश करें।',
    weak: { short: 'कम से कम 12 अक्षर इस्तेमाल करें।', common: 'आम पासवर्ड से बचें।', repeated: 'एक या दो से ज़्यादा अलग अक्षर इस्तेमाल करें।' },
  },
  row: {
    title: 'रिकवरी',
    setUp: 'रिकवरी पासवर्ड सेट करें',
    setUpBody: 'इसके बिना, पासकी खोने का मतलब यह वॉलेट खोना है।',
    off: 'अभी चालू नहीं',
    offBody: 'इसे चालू करें ताकि आपका रिकवरी पासवर्ड इस वॉलेट को वापस ला सके।',
    turnOn: 'चालू करें',
    lowBalance: 'नेटवर्क शुल्क के लिए पहले थोड़ा USDC जोड़ें।',
    on: 'चालू',
    onBody: 'आपका ईमेल और रिकवरी पासवर्ड इस वॉलेट को वापस ला सकते हैं।',
    waiting: 'एक रिकवरी चल रही है',
    waitingBody: 'यह {date} को पूरी हो सकती है। अगर यह आप नहीं थे, तो इसे रद्द करें।',
    cancel: 'रिकवरी रद्द करें',
    cancelling: 'रद्द किया जा रहा है',
    cancelled: 'रिकवरी रद्द हुई',
  },
  sheet: {
    title: 'रिकवरी चालू करें',
    what: 'पासकी खोने पर आपका ईमेल और रिकवरी पासवर्ड इस वॉलेट को वापस ला सकते हैं।',
    fee: 'नेटवर्क शुल्क',
    feeValue: 'अधिकतम {amount} USDC',
    undo: 'यह इस वॉलेट के लिए चालू रहता है।',
    password: 'रिकवरी पासवर्ड',
    confirm: 'रिकवरी चालू करें',
    working: 'चालू किया जा रहा है',
    done: 'रिकवरी चालू है',
    wrong: 'यह पासवर्ड मेल नहीं खाता।',
    failed: 'यह पूरा नहीं हुआ। फिर कोशिश करें।',
    close: 'बंद करें',
  },
  flow: {
    entry: 'पासकी खो गई?',
    title: 'अपना वॉलेट वापस पाएँ',
    intro: 'हम आपको ईमेल पर एक कोड भेजेंगे। फिर आप अपना रिकवरी पासवर्ड डालेंगे।',
    email: 'ईमेल',
    sendCode: 'कोड भेजें',
    sending: 'भेजा जा रहा है',
    code: 'कोड',
    codeSent: '{email} पर भेजा गया 6 अंकों का कोड डालें।',
    continue: 'जारी रखें',
    checking: 'जाँच हो रही है',
    password: 'रिकवरी पासवर्ड',
    start: 'रिकवरी शुरू करें',
    waitingTitle: 'रिकवरी शुरू हुई',
    waitingBody: 'आप {date} को पूरा कर सकते हैं। हमने आपको ईमेल किया है। अगर यह आप नहीं थे, तो ईमेल से रद्द करें।',
    tooEarly: 'रिकवरी चल रही है। आप {date} को पूरा कर सकते हैं।',
    wrong: 'यह पासवर्ड मेल नहीं खाता। आज {n} कोशिशें बाकी हैं।',
    locked: 'बहुत ज़्यादा कोशिशें। {date} के बाद फिर कोशिश करें।',
    neverOn: 'इस वॉलेट के लिए रिकवरी कभी चालू नहीं की गई, इसलिए इसे यहाँ वापस नहीं लाया जा सकता। support@karwan.site पर लिखें।',
    readyTitle: 'नई पासकी बनाएँ',
    readyBody: 'अपना रिकवरी पासवर्ड डालें। फिर आपका डिवाइस पासकी बनाने के लिए कहेगा।',
    createPasskey: 'नई पासकी बनाएँ',
    working: 'आपका वॉलेट वापस लाया जा रहा है',
    doneTitle: 'आप वापस आ गए',
    doneBody: 'आपका वॉलेट अब इस पासकी से काम करता है।',
    openWallet: 'अपना वॉलेट खोलें',
    wrongCode: 'यह कोड काम नहीं किया। जाँचें और फिर कोशिश करें।',
    expired: 'इस चरण का समय खत्म हो गया। फिर से शुरू करें।',
    failed: 'कुछ गलत हो गया। फिर कोशिश करें।',
    back: 'साइन इन पर वापस',
  },
  cancelPage: {
    title: 'रिकवरी रद्द करें',
    body: 'यह आपके वॉलेट का रिकवरी अनुरोध रोक देता है। और कुछ नहीं बदलता।',
    cancel: 'रिकवरी रद्द करें',
    cancelling: 'रद्द किया जा रहा है',
    done: 'रिकवरी रद्द हुई',
    doneBody: 'आपका वॉलेट जैसा था वैसा ही है।',
    invalid: 'यह लिंक समाप्त हो चुका है या पहले इस्तेमाल हो चुका है।',
  },
};

const sw: RecoveryCopy = {
  step: {
    title: 'Weka nenosiri la kurejesha',
    body: 'Ukipoteza passkey yako, nenosiri hili na barua pepe yako vinakurudisha. Hatuwezi kulibadilisha kwa niaba yako.',
    label: 'Nenosiri la kurejesha',
    show: 'Onyesha',
    hide: 'Ficha',
    tip: 'Sentensi fupi utakayoikumbuka inafaa.',
    save: 'Hifadhi nenosiri la kurejesha',
    saving: 'Inahifadhi',
    skip: 'Si sasa',
    failed: 'Hatukuweza kulihifadhi. Jaribu tena.',
    weak: { short: 'Tumia angalau herufi 12.', common: 'Epuka manenosiri ya kawaida.', repeated: 'Tumia zaidi ya herufi moja au mbili tofauti.' },
  },
  row: {
    title: 'Urejeshaji',
    setUp: 'Weka nenosiri la kurejesha',
    setUpBody: 'Bila hilo, kupoteza passkey yako ni kupoteza pochi hii.',
    off: 'Bado haijawashwa',
    offBody: 'Iwashe ili nenosiri lako la kurejesha liweze kurejesha pochi hii.',
    turnOn: 'Washa',
    lowBalance: 'Ongeza USDC kidogo kwanza kulipia ada ya mtandao.',
    on: 'Imewashwa',
    onBody: 'Barua pepe yako na nenosiri la kurejesha vinaweza kurejesha pochi hii.',
    waiting: 'Urejeshaji unaendelea',
    waitingBody: 'Unaweza kukamilika tarehe {date}. Kama si wewe, ughairi.',
    cancel: 'Ghairi urejeshaji',
    cancelling: 'Inaghairi',
    cancelled: 'Urejeshaji umeghairiwa',
  },
  sheet: {
    title: 'Washa urejeshaji',
    what: 'Inaruhusu barua pepe yako na nenosiri la kurejesha kurejesha pochi hii ukipoteza passkey yako.',
    fee: 'Ada ya mtandao',
    feeValue: 'Hadi {amount} USDC',
    undo: 'Hii inabaki imewashwa kwa pochi hii.',
    password: 'Nenosiri la kurejesha',
    confirm: 'Washa urejeshaji',
    working: 'Inawasha',
    done: 'Urejeshaji umewashwa',
    wrong: 'Nenosiri hilo halilingani.',
    failed: 'Haikukamilika. Jaribu tena.',
    close: 'Funga',
  },
  flow: {
    entry: 'Umepoteza passkey?',
    title: 'Rejesha pochi yako',
    intro: 'Tutakutumia msimbo kwa barua pepe. Kisha utaweka nenosiri lako la kurejesha.',
    email: 'Barua pepe',
    sendCode: 'Tuma msimbo',
    sending: 'Inatuma',
    code: 'Msimbo',
    codeSent: 'Weka msimbo wa tarakimu 6 tuliotuma kwa {email}.',
    continue: 'Endelea',
    checking: 'Inakagua',
    password: 'Nenosiri la kurejesha',
    start: 'Anza urejeshaji',
    waitingTitle: 'Urejeshaji umeanza',
    waitingBody: 'Unaweza kukamilisha tarehe {date}. Tumekutumia barua pepe. Kama si wewe, ghairi kupitia barua pepe.',
    tooEarly: 'Urejeshaji unaendelea. Unaweza kukamilisha tarehe {date}.',
    wrong: 'Nenosiri hilo halilingani. Zimebaki majaribio {n} leo.',
    locked: 'Majaribio mengi mno. Jaribu tena baada ya {date}.',
    neverOn: 'Urejeshaji haukuwahi kuwashwa kwa pochi hii, kwa hiyo haiwezi kurejeshwa hapa. Andika kwa support@karwan.site.',
    readyTitle: 'Tengeneza passkey mpya',
    readyBody: 'Weka nenosiri lako la kurejesha. Kisha kifaa chako kitakuomba kutengeneza passkey.',
    createPasskey: 'Tengeneza passkey mpya',
    working: 'Inarejesha pochi yako',
    doneTitle: 'Umerudi',
    doneBody: 'Pochi yako sasa inafanya kazi na passkey hii.',
    openWallet: 'Fungua pochi yako',
    wrongCode: 'Msimbo huo haukufanya kazi. Ukague na ujaribu tena.',
    expired: 'Hatua hii imepitwa na muda. Anza tena.',
    failed: 'Kuna tatizo. Jaribu tena.',
    back: 'Rudi kwenye kuingia',
  },
  cancelPage: {
    title: 'Ghairi urejeshaji',
    body: 'Hii inasimamisha ombi la kurejesha pochi yako. Hakuna kingine kinachobadilika.',
    cancel: 'Ghairi urejeshaji',
    cancelling: 'Inaghairi',
    done: 'Urejeshaji umeghairiwa',
    doneBody: 'Pochi yako inabaki kama ilivyokuwa.',
    invalid: 'Kiungo hiki kimeisha muda au kimeshatumika.',
  },
};

export const recoveryCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', RecoveryCopy> = { en, ar, fr, hi, sw };
