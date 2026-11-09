export interface PayLinkCopy {
  create: {
    title: string;
    short: string;
    amount: string;
    forLabel: string;
    forPlaceholder: string;
    paidTo: string;
    yourAccount: string;
    expiresLabel: string;
    day1: string;
    days7: string;
    days30: string;
    pickDate: string;
    until: string;
    directNote: string;
    /// Phone step one: the amount and its keypad alone (owner, 9 Nov 2026, Figma 224:612).
    howMuch: string;
    /// Phone step two: the amount above the details, with Change back to step one.
    askingFor: string;
    create: string;
    creating: string;
    error: string;
    ready: string;
    copy: string;
    copied: string;
    share: string;
    /// The desktop Share menu (owner, 9 Nov 2026, Figma 226:570).
    shareMenu: string;
    shareEmail: string;
    /// Goes with the link in the message or email subject.
    shareMessage: string;
    another: string;
    qrAlt: string;
    requestedTitle: string;
    paidTitle: string;
    showMore: string;
    statusOpen: string;
    statusPaid: string;
    statusExpired: string;
    statusCancelled: string;
  };
  pay: {
    tag: string;
    directPayment: string;
    forTemplate: string;
    record: string;
    recordOne: string;
    recordNew: string;
    payFrom: string;
    otherChains: string;
    noUsdcOther: string;
    show: string;
    hide: string;
    arc: string;
    walletOn: string;
    payCta: string;
    connect: string;
    useEmail: string;
    accountBalance: string;
    fundTitle: string;
    fundWaiting: string;
    arrivesArc: string;
    arrivesOther: string;
    expires: string;
    paying: string;
    paid: string;
    paidTo: string;
    bothSee: string;
    receiptFor: string;
    paidBadge: string;
    saveReceipt: string;
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
    endRequest: string;
    endTitle: string;
    endNote: string;
    endKeep: string;
    ending: string;
    endError: string;
    unavailableTitle: string;
    unavailableBody: string;
    payWith: string;
    optWallet: string;
    optWalletSub: string;
    optBalance: string;
    optChain: string;
    optChainSub: string;
    evmTab: string;
    solanaTab: string;
    sendExactly: string;
    chainsLine: string;
    copyAddress: string;
    copiedAddress: string;
    watching: string;
    chainError: string;
    chainOff: string;
    stepReceived: string;
    stepMoving: string;
    stepMovingSub: string;
    stepDelayed: string;
    stepPaid: string;
    partReceived: string;
    canClose: string;
    goHome: string;
    joinTitle: string;
    joinBody: string;
    joinCta: string;
    /// The payment card (view 50).
    cardScan: string;
    cardPaidOn: string;
  };
}

const en: PayLinkCopy = {
  create: {
    title: 'Request a payment',
    short: "Request payment",
    amount: 'Amount',
    forLabel: 'For',
    forPlaceholder: 'Logo, first draft',
    paidTo: 'Paid to',
    yourAccount: 'Your account',
    expiresLabel: "Link works until",
    day1: "1 day",
    days7: "7 days",
    days30: "30 days",
    pickDate: "Pick a date",
    until: "Until {date}",
    directNote: "Money goes directly to your account, outside deal escrow.",
    howMuch: "How much do you want?",
    askingFor: "You are asking for",
    create: "Create payment link",
    creating: 'Creating link',
    error: 'Could not create the link. Try again.',
    ready: "Payment link ready",
    copy: 'Copy link',
    copied: 'Link copied',
    share: 'Share',
    shareMenu: 'Share the link',
    shareEmail: 'Email',
    shareMessage: 'Here is my payment link on Karwan',
    another: "New payment request",
    qrAlt: 'QR code for this payment link',
    requestedTitle: "Your payment requests",
    paidTitle: "Paid by you",
    showMore: "Show more",
    statusOpen: "Waiting",
    statusPaid: "Paid",
    statusExpired: "Expired",
    statusCancelled: "Cancelled",
  },
  pay: {
    tag: 'Payment request',
    directPayment: "Payment goes directly to {name}, outside deal escrow.",
    forTemplate: 'For: {purpose}',
    record: '{n} deals',
    recordOne: '1 deal',
    recordNew: 'New on Karwan',
    payFrom: 'Pay from',
    otherChains: "{n} other chains",
    noUsdcOther: "No USDC on {n} other chains",
    show: "Show",
    hide: "Hide",
    arc: 'Arc',
    walletOn: 'Your wallet on {chain}: {amount} USDC',
    payCta: 'Pay {amount} USDC',
    connect: 'Connect a wallet to pay',
    useEmail: "No wallet? Pay from an exchange",
    accountBalance: "Your Karwan balance: {amount} USDC",
    fundTitle: "Send {amount} USDC to pay {name}",
    fundWaiting: "Waiting for your USDC",
    arrivesArc: "Payment completes after network confirmation",
    arrivesOther: "Payment requires confirmation on both networks",
    expires: 'Expires {date}',
    paying: 'Paying {name}',
    paid: 'Paid {amount} USDC',
    paidTo: 'to {name}',
    bothSee: 'The request shows Paid for both of you.',
    receiptFor: 'For',
    paidBadge: 'Paid',
    saveReceipt: "Save receipt",
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
    endRequest: "End request",
    endTitle: "End this request?",
    endNote: "The link stops asking for payment. Money sent to it later still reaches you.",
    endKeep: "Keep it open",
    ending: "Ending request",
    endError: "Couldn't end the request. Try again.",
    unavailableTitle: 'This request is not available.',
    unavailableBody: 'It may have expired, been cancelled, or the link may be incomplete.',
    payWith: "Pay with",
    optWallet: "Connect a wallet",
    optWalletSub: "Arc, Base, Ethereum and more",
    optBalance: "Your Karwan balance",
    optChain: "Send from any chain",
    optChainSub: "An exchange or any wallet",
    evmTab: "EVM chains",
    solanaTab: "Solana",
    sendExactly: "Send exactly",
    chainsLine: "{chains}. USDC only.",
    copyAddress: "Copy address",
    copiedAddress: "Address copied",
    watching: "Watching for your payment",
    chainError: "Could not prepare an address. Try again.",
    chainOff: "Sending from another chain is not available here yet.",
    stepReceived: "Received on {chain}",
    stepMoving: "Moving to Arc",
    stepMovingSub: "About a minute",
    stepDelayed: "Delayed. The money is safe on {chain}.",
    stepPaid: "Paid to {name}",
    partReceived: "Received {got} of {total} USDC. Send {left} USDC more to the same address.",
    canClose: "You can close this page. {name} sees it either way.",
    goHome: "Go to home",
    joinTitle: "Get paid the same way",
    joinBody: "Requests, protected deals and one balance on Arc.",
    joinCta: "Create your account",
    cardScan: "Scan or open the link",
    cardPaidOn: "Paid {date}",
  },
};

const fr: PayLinkCopy = {
  create: {
    title: 'Demander un paiement',
    short: "Demander un paiement",
    amount: 'Montant',
    forLabel: 'Pour',
    forPlaceholder: 'Logo, première version',
    paidTo: 'Payé à',
    yourAccount: 'Votre compte',
    expiresLabel: "Le lien reste valable jusqu’au",
    day1: "1 jour",
    days7: "7 jours",
    days30: "30 jours",
    pickDate: "Choisir une date",
    until: "Jusqu’au {date}",
    directNote: "L’argent arrive directement sur votre compte, hors séquestre d’un accord.",
    howMuch: "Combien voulez-vous demander ?",
    askingFor: "Vous demandez",
    create: "Créer un lien de paiement",
    creating: 'Création du lien',
    error: 'Impossible de créer le lien. Réessayez.',
    ready: "Lien de paiement prêt",
    copy: 'Copier le lien',
    copied: 'Lien copié',
    share: 'Partager',
    shareMenu: 'Partager le lien',
    shareEmail: 'E-mail',
    shareMessage: 'Voici mon lien de paiement Karwan',
    another: "Nouvelle demande de paiement",
    qrAlt: 'QR code de ce lien de paiement',
    requestedTitle: "Vos demandes de paiement",
    paidTitle: "Payées par vous",
    showMore: "Afficher plus",
    statusOpen: "En attente",
    statusPaid: "Payée",
    statusExpired: "Expirée",
    statusCancelled: "Annulée",
  },
  pay: {
    tag: 'Demande de paiement',
    directPayment: "Le paiement va directement à {name}, hors séquestre d’un accord.",
    forTemplate: 'Pour : {purpose}',
    record: '{n} transactions',
    recordOne: '1 transaction',
    recordNew: 'Nouveau sur Karwan',
    payFrom: 'Payer depuis',
    otherChains: "{n} autres chaînes",
    noUsdcOther: "Pas d'USDC sur {n} autres chaînes",
    show: "Afficher",
    hide: "Masquer",
    arc: 'Arc',
    walletOn: 'Votre portefeuille sur {chain} : {amount} USDC',
    payCta: 'Payer {amount} USDC',
    connect: 'Connectez un portefeuille pour payer',
    useEmail: "Pas de portefeuille ? Payez depuis une plateforme d’échange",
    accountBalance: "Votre solde Karwan : {amount} USDC",
    fundTitle: "Envoyez {amount} USDC pour payer {name}",
    fundWaiting: "En attente de vos USDC",
    arrivesArc: "Le paiement se termine après confirmation du réseau",
    arrivesOther: "Le paiement nécessite la confirmation des deux réseaux",
    expires: 'Expire le {date}',
    paying: 'Paiement à {name}',
    paid: '{amount} USDC payés',
    paidTo: 'à {name}',
    bothSee: 'La demande indique Payé pour vous deux.',
    receiptFor: 'Pour',
    paidBadge: 'Payé',
    saveReceipt: "Enregistrer le reçu",
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
    endRequest: "Clore la demande",
    endTitle: "Clore cette demande ?",
    endNote: "Le lien ne demande plus de paiement. L’argent envoyé plus tard vous parvient quand même.",
    endKeep: "La garder ouverte",
    ending: "Clôture de la demande",
    endError: "Impossible de clore la demande. Réessayez.",
    unavailableTitle: 'Cette demande n’est pas disponible.',
    unavailableBody: 'Elle a peut-être expiré, été annulée, ou le lien est incomplet.',
    payWith: "Payer avec",
    optWallet: "Connecter un portefeuille",
    optWalletSub: "Arc, Base, Ethereum et plus",
    optBalance: "Votre solde Karwan",
    optChain: "Envoyer depuis n'importe quelle chaîne",
    optChainSub: "Une plateforme d'échange ou tout portefeuille",
    evmTab: "Chaînes EVM",
    solanaTab: "Solana",
    sendExactly: "Envoyez exactement",
    chainsLine: "{chains}. USDC uniquement.",
    copyAddress: "Copier l'adresse",
    copiedAddress: "Adresse copiée",
    watching: "En attente de votre paiement",
    chainError: "Impossible de préparer une adresse. Réessayez.",
    chainOff: "L'envoi depuis une autre chaîne n'est pas encore disponible ici.",
    stepReceived: "Reçu sur {chain}",
    stepMoving: "Transfert vers Arc",
    stepMovingSub: "Environ une minute",
    stepDelayed: "Retardé. L'argent est en sécurité sur {chain}.",
    stepPaid: "Payé à {name}",
    partReceived: "{got} USDC reçus sur {total}. Envoyez encore {left} USDC à la même adresse.",
    canClose: "Vous pouvez fermer cette page. {name} le voit dans tous les cas.",
    goHome: "Aller à l'accueil",
    joinTitle: "Soyez payé de la même façon",
    joinBody: "Demandes, transactions protégées et un seul solde sur Arc.",
    joinCta: "Créer votre compte",
    cardScan: "Scannez ou ouvrez le lien",
    cardPaidOn: "Payé le {date}",
  },
};

const ar: PayLinkCopy = {
  create: {
    title: 'اطلب دفعة',
    short: "اطلب دفعة",
    amount: 'المبلغ',
    forLabel: 'مقابل',
    forPlaceholder: 'شعار، المسودة الأولى',
    paidTo: 'يُدفع إلى',
    yourAccount: 'حسابك',
    expiresLabel: "يعمل الرابط حتى",
    day1: "يوم واحد",
    days7: "7 أيام",
    days30: "30 يومًا",
    pickDate: "اختر تاريخًا",
    until: "حتى {date}",
    directNote: "يصل المال مباشرة إلى حسابك، خارج ضمان الصفقات.",
    howMuch: "كم تريد أن تطلب؟",
    askingFor: "المبلغ المطلوب",
    create: "أنشئ رابط دفع",
    creating: 'جارٍ إنشاء الرابط',
    error: 'تعذّر إنشاء الرابط. حاول مرة أخرى.',
    ready: "رابط الدفع جاهز",
    copy: 'انسخ الرابط',
    copied: 'تم نسخ الرابط',
    share: 'مشاركة',
    shareMenu: 'مشاركة الرابط',
    shareEmail: 'البريد الإلكتروني',
    shareMessage: 'هذا رابط الدفع الخاص بي على Karwan',
    another: "طلب دفع جديد",
    qrAlt: 'رمز QR لرابط الدفع هذا',
    requestedTitle: "طلبات الدفع الخاصة بك",
    paidTitle: "دفعتها أنت",
    showMore: "عرض المزيد",
    statusOpen: "بانتظار الدفع",
    statusPaid: "مدفوع",
    statusExpired: "منتهي",
    statusCancelled: "ملغى",
  },
  pay: {
    tag: 'طلب دفع',
    directPayment: "يصل المبلغ مباشرة إلى {name}، خارج ضمان الصفقات.",
    forTemplate: 'مقابل: {purpose}',
    record: '{n} صفقة',
    recordOne: 'صفقة واحدة',
    recordNew: 'جديد على Karwan',
    payFrom: 'ادفع من',
    otherChains: "{n} شبكات أخرى",
    noUsdcOther: "لا USDC على {n} شبكات أخرى",
    show: "عرض",
    hide: "إخفاء",
    arc: 'Arc',
    walletOn: 'محفظتك على {chain}: {amount} USDC',
    payCta: 'ادفع {amount} USDC',
    connect: 'اربط محفظة للدفع',
    useEmail: "لا محفظة؟ ادفع من منصة تداول",
    accountBalance: "رصيدك في Karwan: {amount} USDC",
    fundTitle: "أرسل {amount} USDC للدفع إلى {name}",
    fundWaiting: "في انتظار USDC الخاصة بك",
    arrivesArc: "يكتمل الدفع بعد تأكيد الشبكة",
    arrivesOther: "يتطلب الدفع تأكيد الشبكتين",
    expires: 'ينتهي في {date}',
    paying: 'الدفع إلى {name}',
    paid: 'تم دفع {amount} USDC',
    paidTo: 'إلى {name}',
    bothSee: 'يظهر الطلب مدفوعًا لكليكما.',
    receiptFor: 'مقابل',
    paidBadge: 'مدفوع',
    saveReceipt: "حفظ الإيصال",
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
    endRequest: "إنهاء الطلب",
    endTitle: "إنهاء هذا الطلب؟",
    endNote: "يتوقف الرابط عن طلب الدفع. المال المرسل إليه لاحقًا يصلك مع ذلك.",
    endKeep: "إبقاؤه مفتوحًا",
    ending: "جارٍ إنهاء الطلب",
    endError: "تعذّر إنهاء الطلب. حاول مرة أخرى.",
    unavailableTitle: 'هذا الطلب غير متاح.',
    unavailableBody: 'ربما انتهت صلاحيته أو أُلغي، أو أن الرابط غير مكتمل.',
    payWith: "الدفع عبر",
    optWallet: "ربط محفظة",
    optWalletSub: "Arc وBase وEthereum وغيرها",
    optBalance: "رصيدك في Karwan",
    optChain: "الإرسال من أي شبكة",
    optChainSub: "منصة تداول أو أي محفظة",
    evmTab: "شبكات EVM",
    solanaTab: "Solana",
    sendExactly: "أرسل بالضبط",
    chainsLine: "{chains}. USDC فقط.",
    copyAddress: "نسخ العنوان",
    copiedAddress: "تم نسخ العنوان",
    watching: "بانتظار دفعتك",
    chainError: "تعذر تجهيز عنوان. حاول مرة أخرى.",
    chainOff: "الإرسال من شبكة أخرى غير متاح هنا بعد.",
    stepReceived: "تم الاستلام على {chain}",
    stepMoving: "جارٍ النقل إلى Arc",
    stepMovingSub: "نحو دقيقة",
    stepDelayed: "متأخر. المال آمن على {chain}.",
    stepPaid: "تم الدفع إلى {name}",
    partReceived: "استُلم {got} من {total} USDC. أرسل {left} USDC إضافية إلى العنوان نفسه.",
    canClose: "يمكنك إغلاق هذه الصفحة. سيرى {name} الدفعة في كل الأحوال.",
    goHome: "الذهاب إلى الرئيسية",
    joinTitle: "احصل على أموالك بالطريقة نفسها",
    joinBody: "طلبات وصفقات محمية ورصيد واحد على Arc.",
    joinCta: "أنشئ حسابك",
    cardScan: "امسح الرمز أو افتح الرابط",
    cardPaidOn: "دُفع في {date}",
  },
};

const hi: PayLinkCopy = {
  create: {
    title: 'भुगतान का अनुरोध करें',
    short: "भुगतान माँगें",
    amount: 'राशि',
    forLabel: 'किसके लिए',
    forPlaceholder: 'लोगो, पहला ड्राफ़्ट',
    paidTo: 'किसे भुगतान',
    yourAccount: 'आपका खाता',
    expiresLabel: "लिंक इस तारीख तक काम करेगा",
    day1: "1 दिन",
    days7: "7 दिन",
    days30: "30 दिन",
    pickDate: "तारीख चुनें",
    until: "{date} तक",
    directNote: "राशि सीधे आपके खाते में आती है, सौदे के एस्क्रो में नहीं।",
    howMuch: "आप कितना माँगना चाहते हैं?",
    askingFor: "आप माँग रहे हैं",
    create: "भुगतान लिंक बनाएँ",
    creating: 'लिंक बन रहा है',
    error: 'लिंक नहीं बन सका। फिर से कोशिश करें।',
    ready: "भुगतान लिंक तैयार है",
    copy: 'लिंक कॉपी करें',
    copied: 'लिंक कॉपी हो गया',
    share: 'शेयर करें',
    shareMenu: 'लिंक शेयर करें',
    shareEmail: 'ईमेल',
    shareMessage: 'Karwan पर मेरा भुगतान लिंक यह है',
    another: "नया भुगतान अनुरोध",
    qrAlt: 'इस भुगतान लिंक का QR कोड',
    requestedTitle: "आपके भुगतान अनुरोध",
    paidTitle: "आपने भुगतान किया",
    showMore: "और दिखाएँ",
    statusOpen: "प्रतीक्षा में",
    statusPaid: "भुगतान हुआ",
    statusExpired: "समाप्त",
    statusCancelled: "रद्द",
  },
  pay: {
    tag: 'भुगतान अनुरोध',
    directPayment: "भुगतान सीधे {name} को जाता है, सौदे के एस्क्रो में नहीं।",
    forTemplate: 'किसके लिए: {purpose}',
    record: '{n} डील',
    recordOne: '1 डील',
    recordNew: 'Karwan पर नया',
    payFrom: 'यहाँ से भुगतान करें',
    otherChains: "{n} अन्य चेन",
    noUsdcOther: "{n} अन्य चेन पर कोई USDC नहीं",
    show: "दिखाएँ",
    hide: "छिपाएँ",
    arc: 'Arc',
    walletOn: '{chain} पर आपका वॉलेट: {amount} USDC',
    payCta: '{amount} USDC भुगतान करें',
    connect: 'भुगतान के लिए वॉलेट जोड़ें',
    useEmail: "वॉलेट नहीं है? एक्सचेंज से भुगतान करें",
    accountBalance: "आपका Karwan बैलेंस: {amount} USDC",
    fundTitle: "{name} को भुगतान करने के लिए {amount} USDC भेजें",
    fundWaiting: "आपके USDC का इंतज़ार है",
    arrivesArc: "नेटवर्क पुष्टि के बाद भुगतान पूरा होता है",
    arrivesOther: "भुगतान के लिए दोनों नेटवर्कों पर पुष्टि आवश्यक है",
    expires: '{date} को समाप्त',
    paying: '{name} को भुगतान',
    paid: '{amount} USDC का भुगतान हुआ',
    paidTo: '{name} को',
    bothSee: 'अनुरोध आप दोनों के लिए भुगतान हुआ दिखाता है।',
    receiptFor: 'किसके लिए',
    paidBadge: 'भुगतान हुआ',
    saveReceipt: "रसीद सहेजें",
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
    endRequest: "अनुरोध बंद करें",
    endTitle: "यह अनुरोध बंद करें?",
    endNote: "लिंक भुगतान मांगना बंद कर देता है। बाद में भेजा गया पैसा फिर भी आप तक पहुंचता है।",
    endKeep: "खुला रखें",
    ending: "अनुरोध बंद हो रहा है",
    endError: "अनुरोध बंद नहीं हो सका। फिर से कोशिश करें।",
    unavailableTitle: 'यह अनुरोध उपलब्ध नहीं है।',
    unavailableBody: 'यह समाप्त या रद्द हो सकता है, या लिंक अधूरा है।',
    payWith: "इससे भुगतान करें",
    optWallet: "वॉलेट जोड़ें",
    optWalletSub: "Arc, Base, Ethereum और अन्य",
    optBalance: "आपका Karwan बैलेंस",
    optChain: "किसी भी चेन से भेजें",
    optChainSub: "कोई एक्सचेंज या कोई भी वॉलेट",
    evmTab: "EVM चेन",
    solanaTab: "Solana",
    sendExactly: "ठीक इतना भेजें",
    chainsLine: "{chains}. केवल USDC.",
    copyAddress: "पता कॉपी करें",
    copiedAddress: "पता कॉपी हो गया",
    watching: "आपके भुगतान की प्रतीक्षा",
    chainError: "पता तैयार नहीं हो सका। फिर से कोशिश करें।",
    chainOff: "दूसरी चेन से भेजना यहाँ अभी उपलब्ध नहीं है।",
    stepReceived: "{chain} पर मिला",
    stepMoving: "Arc पर भेजा जा रहा है",
    stepMovingSub: "लगभग एक मिनट",
    stepDelayed: "देरी हो रही है। पैसा {chain} पर सुरक्षित है।",
    stepPaid: "{name} को भुगतान हो गया",
    partReceived: "{total} में से {got} USDC मिले। उसी पते पर {left} USDC और भेजें।",
    canClose: "आप यह पेज बंद कर सकते हैं। {name} इसे हर हाल में देखेंगे।",
    goHome: "होम पर जाएँ",
    joinTitle: "इसी तरह भुगतान पाएँ",
    joinBody: "अनुरोध, सुरक्षित सौदे और Arc पर एक बैलेंस।",
    joinCta: "अपना खाता बनाएँ",
    cardScan: "स्कैन करें या लिंक खोलें",
    cardPaidOn: "{date} को भुगतान हुआ",
  },
};

const sw: PayLinkCopy = {
  create: {
    title: 'Omba malipo',
    short: "Omba malipo",
    amount: 'Kiasi',
    forLabel: 'Kwa ajili ya',
    forPlaceholder: 'Nembo, rasimu ya kwanza',
    paidTo: 'Analipwa',
    yourAccount: 'Akaunti yako',
    expiresLabel: "Kiungo kinafanya kazi hadi",
    day1: "Siku 1",
    days7: "Siku 7",
    days30: "Siku 30",
    pickDate: "Chagua tarehe",
    until: "Hadi {date}",
    directNote: "Pesa zinaingia moja kwa moja kwenye akaunti yako, nje ya escrow ya makubaliano.",
    howMuch: "Unataka kiasi gani?",
    askingFor: "Unaomba",
    create: "Unda kiungo cha malipo",
    creating: 'Inaunda kiungo',
    error: 'Imeshindwa kuunda kiungo. Jaribu tena.',
    ready: "Kiungo cha malipo kiko tayari",
    copy: 'Nakili kiungo',
    copied: 'Kiungo kimenakiliwa',
    share: 'Shiriki',
    shareMenu: 'Shiriki kiungo',
    shareEmail: 'Barua pepe',
    shareMessage: 'Hiki ni kiungo changu cha malipo kwenye Karwan',
    another: "Ombi jipya la malipo",
    qrAlt: 'Msimbo wa QR wa kiungo hiki cha malipo',
    requestedTitle: "Maombi yako ya malipo",
    paidTitle: "Uliyolipa",
    showMore: "Onyesha zaidi",
    statusOpen: "Inasubiri",
    statusPaid: "Imelipwa",
    statusExpired: "Imeisha muda",
    statusCancelled: "Imeghairiwa",
  },
  pay: {
    tag: 'Ombi la malipo',
    directPayment: "Malipo yanaenda moja kwa moja kwa {name}, nje ya escrow ya makubaliano.",
    forTemplate: 'Kwa ajili ya: {purpose}',
    record: 'mipango {n}',
    recordOne: 'mpango 1',
    recordNew: 'Mpya kwenye Karwan',
    payFrom: 'Lipa kutoka',
    otherChains: "Minyororo mingine {n}",
    noUsdcOther: "Hakuna USDC kwenye minyororo mingine {n}",
    show: "Onyesha",
    hide: "Ficha",
    arc: 'Arc',
    walletOn: 'Pochi yako kwenye {chain}: USDC {amount}',
    payCta: 'Lipa USDC {amount}',
    connect: 'Unganisha pochi ili ulipe',
    useEmail: "Huna pochi? Lipa kutoka soko la kubadilisha",
    accountBalance: "Salio lako la Karwan: USDC {amount}",
    fundTitle: "Tuma USDC {amount} ili umlipe {name}",
    fundWaiting: "Tunasubiri USDC yako",
    arrivesArc: "Malipo hukamilika baada ya uthibitisho wa mtandao",
    arrivesOther: "Malipo yanahitaji uthibitisho wa mitandao yote miwili",
    expires: 'Inaisha {date}',
    paying: 'Unamlipa {name}',
    paid: 'USDC {amount} zimelipwa',
    paidTo: 'kwa {name}',
    bothSee: 'Ombi linaonyesha Limelipwa kwa nyote wawili.',
    receiptFor: 'Kwa ajili ya',
    paidBadge: 'Imelipwa',
    saveReceipt: "Hifadhi risiti",
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
    endRequest: "Funga ombi",
    endTitle: "Funga ombi hili?",
    endNote: "Kiungo kinaacha kuomba malipo. Pesa zitakazotumwa baadaye bado zitakufikia.",
    endKeep: "Liache wazi",
    ending: "Inafunga ombi",
    endError: "Imeshindwa kufunga ombi. Jaribu tena.",
    unavailableTitle: 'Ombi hili halipatikani.',
    unavailableBody: 'Huenda limeisha muda, limeghairiwa, au kiungo hakijakamilika.',
    payWith: "Lipa kwa",
    optWallet: "Unganisha pochi",
    optWalletSub: "Arc, Base, Ethereum na zaidi",
    optBalance: "Salio lako la Karwan",
    optChain: "Tuma kutoka mnyororo wowote",
    optChainSub: "Soko la kubadilishana au pochi yoyote",
    evmTab: "Minyororo ya EVM",
    solanaTab: "Solana",
    sendExactly: "Tuma kiasi hiki kamili",
    chainsLine: "{chains}. USDC pekee.",
    copyAddress: "Nakili anwani",
    copiedAddress: "Anwani imenakiliwa",
    watching: "Tunasubiri malipo yako",
    chainError: "Imeshindwa kuandaa anwani. Jaribu tena.",
    chainOff: "Kutuma kutoka mnyororo mwingine bado hakupatikani hapa.",
    stepReceived: "Imepokelewa kwenye {chain}",
    stepMoving: "Inahamishwa kwenda Arc",
    stepMovingSub: "Takriban dakika moja",
    stepDelayed: "Imechelewa. Pesa iko salama kwenye {chain}.",
    stepPaid: "Imelipwa kwa {name}",
    partReceived: "Imepokelewa USDC {got} kati ya {total}. Tuma USDC {left} zaidi kwa anwani ileile.",
    canClose: "Unaweza kufunga ukurasa huu. {name} ataona kwa vyovyote.",
    goHome: "Nenda nyumbani",
    joinTitle: "Lipwa kwa njia hiyo hiyo",
    joinBody: "Maombi, mikataba iliyolindwa na salio moja kwenye Arc.",
    joinCta: "Fungua akaunti yako",
    cardScan: "Changanua au fungua kiungo",
    cardPaidOn: "Imelipwa {date}",
  },
};

export const payLinkCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', PayLinkCopy> = { en, ar, fr, hi, sw };
