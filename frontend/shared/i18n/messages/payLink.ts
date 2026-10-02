export interface PayLinkCopy {
  create: {
    title: string;
    short: string;
    amount: string;
    forLabel: string;
    forPlaceholder: string;
    paidTo: string;
    yourAccount: string;
    lasts: string;
    create: string;
    creating: string;
    error: string;
    ready: string;
    copy: string;
    copied: string;
    share: string;
    another: string;
    qrAlt: string;
  };
  pay: {
    tag: string;
    forTemplate: string;
    record: string;
    recordNew: string;
    payFrom: string;
    arc: string;
    walletOn: string;
    payCta: string;
    connect: string;
    useEmail: string;
    accountBalance: string;
    accountShort: string;
    arrivesArc: string;
    arrivesOther: string;
    expires: string;
    paying: string;
    paid: string;
    paidTo: string;
    bothSee: string;
    receiptFor: string;
    paidBadge: string;
    receiptKind: string;
    receiptTo: string;
    receiptDate: string;
    receiptFrom: string;
    receiptRef: string;
    done: string;
    notEnough: string;
    yours: string;
    paidAlready: string;
    expired: string;
    cancelled: string;
    unavailableTitle: string;
    unavailableBody: string;
  };
}

const en: PayLinkCopy = {
  create: {
    title: 'Request a payment',
    short: 'Request',
    amount: 'Amount',
    forLabel: 'For',
    forPlaceholder: 'Logo, first draft',
    paidTo: 'Paid to',
    yourAccount: 'Your account',
    lasts: 'The link works for 7 days.',
    create: 'Create link',
    creating: 'Creating link',
    error: 'Could not create the link. Try again.',
    ready: 'Link ready',
    copy: 'Copy link',
    copied: 'Link copied',
    share: 'Share',
    another: 'New request',
    qrAlt: 'QR code for this payment link',
  },
  pay: {
    tag: 'Payment request',
    forTemplate: 'For: {purpose}',
    record: '{tier} · {n} deals',
    recordNew: 'New on Karwan',
    payFrom: 'Pay from',
    arc: 'Arc',
    walletOn: 'Your wallet on {chain}: {amount} USDC',
    payCta: 'Pay {amount} USDC',
    connect: 'Connect a wallet to pay',
    useEmail: "Use email or passkey",
    accountBalance: "Your Karwan balance: {amount} USDC",
    accountShort: "Your Karwan balance is too low for this.",
    arrivesArc: 'Arrives in seconds',
    arrivesOther: 'Arrives on Arc in about a minute',
    expires: 'Expires {date}',
    paying: 'Paying {name}',
    paid: 'Paid {amount} USDC',
    paidTo: 'to {name}',
    bothSee: 'The request shows Paid for both of you.',
    receiptFor: 'For',
    paidBadge: 'Paid',
    receiptKind: 'Payment receipt',
    receiptTo: 'To',
    receiptDate: 'Date',
    receiptFrom: 'From',
    receiptRef: 'Reference',
    done: 'Done',
    notEnough: 'Not enough USDC on {chain}.',
    yours: 'This is your request. Share the link with the person paying.',
    paidAlready: 'This request is paid.',
    expired: 'This request has expired.',
    cancelled: 'This request was cancelled.',
    unavailableTitle: 'This request is not available.',
    unavailableBody: 'It may have expired, been cancelled, or the link may be incomplete.',
  },
};

const fr: PayLinkCopy = {
  create: {
    title: 'Demander un paiement',
    short: 'Demander',
    amount: 'Montant',
    forLabel: 'Pour',
    forPlaceholder: 'Logo, première version',
    paidTo: 'Payé à',
    yourAccount: 'Votre compte',
    lasts: 'Le lien reste valable 7 jours.',
    create: 'Créer le lien',
    creating: 'Création du lien',
    error: 'Impossible de créer le lien. Réessayez.',
    ready: 'Lien prêt',
    copy: 'Copier le lien',
    copied: 'Lien copié',
    share: 'Partager',
    another: 'Nouvelle demande',
    qrAlt: 'QR code de ce lien de paiement',
  },
  pay: {
    tag: 'Demande de paiement',
    forTemplate: 'Pour : {purpose}',
    record: '{tier} · {n} transactions',
    recordNew: 'Nouveau sur Karwan',
    payFrom: 'Payer depuis',
    arc: 'Arc',
    walletOn: 'Votre portefeuille sur {chain} : {amount} USDC',
    payCta: 'Payer {amount} USDC',
    connect: 'Connectez un portefeuille pour payer',
    useEmail: "Utiliser e-mail ou passkey",
    accountBalance: "Votre solde Karwan : {amount} USDC",
    accountShort: "Votre solde Karwan est trop bas pour ce paiement.",
    arrivesArc: 'Arrive en quelques secondes',
    arrivesOther: 'Arrive sur Arc en une minute environ',
    expires: 'Expire le {date}',
    paying: 'Paiement à {name}',
    paid: '{amount} USDC payés',
    paidTo: 'à {name}',
    bothSee: 'La demande indique Payé pour vous deux.',
    receiptFor: 'Pour',
    paidBadge: 'Payé',
    receiptKind: 'Reçu de paiement',
    receiptTo: 'À',
    receiptDate: 'Date',
    receiptFrom: 'Depuis',
    receiptRef: 'Référence',
    done: 'Terminé',
    notEnough: 'Pas assez d’USDC sur {chain}.',
    yours: 'C’est votre demande. Partagez le lien avec la personne qui paie.',
    paidAlready: 'Cette demande est payée.',
    expired: 'Cette demande a expiré.',
    cancelled: 'Cette demande a été annulée.',
    unavailableTitle: 'Cette demande n’est pas disponible.',
    unavailableBody: 'Elle a peut-être expiré, été annulée, ou le lien est incomplet.',
  },
};

const ar: PayLinkCopy = {
  create: {
    title: 'اطلب دفعة',
    short: 'اطلب',
    amount: 'المبلغ',
    forLabel: 'مقابل',
    forPlaceholder: 'شعار، المسودة الأولى',
    paidTo: 'يُدفع إلى',
    yourAccount: 'حسابك',
    lasts: 'يعمل الرابط لمدة 7 أيام.',
    create: 'أنشئ الرابط',
    creating: 'جارٍ إنشاء الرابط',
    error: 'تعذّر إنشاء الرابط. حاول مرة أخرى.',
    ready: 'الرابط جاهز',
    copy: 'انسخ الرابط',
    copied: 'تم نسخ الرابط',
    share: 'مشاركة',
    another: 'طلب جديد',
    qrAlt: 'رمز QR لرابط الدفع هذا',
  },
  pay: {
    tag: 'طلب دفع',
    forTemplate: 'مقابل: {purpose}',
    record: '{tier} · {n} صفقة',
    recordNew: 'جديد على Karwan',
    payFrom: 'ادفع من',
    arc: 'Arc',
    walletOn: 'محفظتك على {chain}: {amount} USDC',
    payCta: 'ادفع {amount} USDC',
    connect: 'اربط محفظة للدفع',
    useEmail: "استخدم البريد الإلكتروني أو مفتاح المرور",
    accountBalance: "رصيدك في Karwan: {amount} USDC",
    accountShort: "رصيدك في Karwan لا يكفي لهذا الدفع.",
    arrivesArc: 'يصل خلال ثوانٍ',
    arrivesOther: 'يصل إلى Arc خلال دقيقة تقريبًا',
    expires: 'ينتهي في {date}',
    paying: 'الدفع إلى {name}',
    paid: 'تم دفع {amount} USDC',
    paidTo: 'إلى {name}',
    bothSee: 'يظهر الطلب مدفوعًا لكليكما.',
    receiptFor: 'مقابل',
    paidBadge: 'مدفوع',
    receiptKind: 'إيصال دفع',
    receiptTo: 'إلى',
    receiptDate: 'التاريخ',
    receiptFrom: 'من',
    receiptRef: 'المرجع',
    done: 'تم',
    notEnough: 'لا يوجد USDC كافٍ على {chain}.',
    yours: 'هذا طلبك. شارك الرابط مع الشخص الذي سيدفع.',
    paidAlready: 'تم دفع هذا الطلب.',
    expired: 'انتهت صلاحية هذا الطلب.',
    cancelled: 'تم إلغاء هذا الطلب.',
    unavailableTitle: 'هذا الطلب غير متاح.',
    unavailableBody: 'ربما انتهت صلاحيته أو أُلغي، أو أن الرابط غير مكتمل.',
  },
};

const hi: PayLinkCopy = {
  create: {
    title: 'भुगतान का अनुरोध करें',
    short: 'अनुरोध करें',
    amount: 'राशि',
    forLabel: 'किसके लिए',
    forPlaceholder: 'लोगो, पहला ड्राफ़्ट',
    paidTo: 'किसे भुगतान',
    yourAccount: 'आपका खाता',
    lasts: 'लिंक 7 दिनों तक काम करता है।',
    create: 'लिंक बनाएँ',
    creating: 'लिंक बन रहा है',
    error: 'लिंक नहीं बन सका। फिर से कोशिश करें।',
    ready: 'लिंक तैयार है',
    copy: 'लिंक कॉपी करें',
    copied: 'लिंक कॉपी हो गया',
    share: 'शेयर करें',
    another: 'नया अनुरोध',
    qrAlt: 'इस भुगतान लिंक का QR कोड',
  },
  pay: {
    tag: 'भुगतान अनुरोध',
    forTemplate: 'किसके लिए: {purpose}',
    record: '{tier} · {n} डील',
    recordNew: 'Karwan पर नया',
    payFrom: 'यहाँ से भुगतान करें',
    arc: 'Arc',
    walletOn: '{chain} पर आपका वॉलेट: {amount} USDC',
    payCta: '{amount} USDC भुगतान करें',
    connect: 'भुगतान के लिए वॉलेट जोड़ें',
    useEmail: "ईमेल या पासकी से जारी रखें",
    accountBalance: "आपका Karwan बैलेंस: {amount} USDC",
    accountShort: "इस भुगतान के लिए आपका Karwan बैलेंस कम है।",
    arrivesArc: 'कुछ सेकंड में पहुँचता है',
    arrivesOther: 'लगभग एक मिनट में Arc पर पहुँचता है',
    expires: '{date} को समाप्त',
    paying: '{name} को भुगतान',
    paid: '{amount} USDC का भुगतान हुआ',
    paidTo: '{name} को',
    bothSee: 'अनुरोध आप दोनों के लिए भुगतान हुआ दिखाता है।',
    receiptFor: 'किसके लिए',
    paidBadge: 'भुगतान हुआ',
    receiptKind: 'भुगतान रसीद',
    receiptTo: 'किसे',
    receiptDate: 'तारीख',
    receiptFrom: 'कहाँ से',
    receiptRef: 'संदर्भ',
    done: 'हो गया',
    notEnough: '{chain} पर पर्याप्त USDC नहीं है।',
    yours: 'यह आपका अनुरोध है। भुगतान करने वाले के साथ लिंक शेयर करें।',
    paidAlready: 'इस अनुरोध का भुगतान हो चुका है।',
    expired: 'यह अनुरोध समाप्त हो गया है।',
    cancelled: 'यह अनुरोध रद्द कर दिया गया।',
    unavailableTitle: 'यह अनुरोध उपलब्ध नहीं है।',
    unavailableBody: 'यह समाप्त या रद्द हो सकता है, या लिंक अधूरा है।',
  },
};

const sw: PayLinkCopy = {
  create: {
    title: 'Omba malipo',
    short: 'Omba',
    amount: 'Kiasi',
    forLabel: 'Kwa ajili ya',
    forPlaceholder: 'Nembo, rasimu ya kwanza',
    paidTo: 'Analipwa',
    yourAccount: 'Akaunti yako',
    lasts: 'Kiungo kinafanya kazi kwa siku 7.',
    create: 'Unda kiungo',
    creating: 'Inaunda kiungo',
    error: 'Imeshindwa kuunda kiungo. Jaribu tena.',
    ready: 'Kiungo kiko tayari',
    copy: 'Nakili kiungo',
    copied: 'Kiungo kimenakiliwa',
    share: 'Shiriki',
    another: 'Ombi jipya',
    qrAlt: 'Msimbo wa QR wa kiungo hiki cha malipo',
  },
  pay: {
    tag: 'Ombi la malipo',
    forTemplate: 'Kwa ajili ya: {purpose}',
    record: '{tier} · mipango {n}',
    recordNew: 'Mpya kwenye Karwan',
    payFrom: 'Lipa kutoka',
    arc: 'Arc',
    walletOn: 'Pochi yako kwenye {chain}: USDC {amount}',
    payCta: 'Lipa USDC {amount}',
    connect: 'Unganisha pochi ili ulipe',
    useEmail: "Tumia barua pepe au passkey",
    accountBalance: "Salio lako la Karwan: USDC {amount}",
    accountShort: "Salio lako la Karwan halitoshi kwa malipo haya.",
    arrivesArc: 'Inafika ndani ya sekunde',
    arrivesOther: 'Inafika Arc ndani ya dakika moja hivi',
    expires: 'Inaisha {date}',
    paying: 'Unamlipa {name}',
    paid: 'USDC {amount} zimelipwa',
    paidTo: 'kwa {name}',
    bothSee: 'Ombi linaonyesha Limelipwa kwa nyote wawili.',
    receiptFor: 'Kwa ajili ya',
    paidBadge: 'Imelipwa',
    receiptKind: 'Risiti ya malipo',
    receiptTo: 'Kwa',
    receiptDate: 'Tarehe',
    receiptFrom: 'Kutoka',
    receiptRef: 'Kumbukumbu',
    done: 'Imekamilika',
    notEnough: 'Hakuna USDC za kutosha kwenye {chain}.',
    yours: 'Hili ni ombi lako. Shiriki kiungo na anayelipa.',
    paidAlready: 'Ombi hili limelipwa.',
    expired: 'Ombi hili limeisha muda.',
    cancelled: 'Ombi hili lilighairiwa.',
    unavailableTitle: 'Ombi hili halipatikani.',
    unavailableBody: 'Huenda limeisha muda, limeghairiwa, au kiungo hakijakamilika.',
  },
};

export const payLinkCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', PayLinkCopy> = { en, ar, fr, hi, sw };
