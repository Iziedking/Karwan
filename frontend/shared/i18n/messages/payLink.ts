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
    payWith: string;
    optWallet: string;
    optWalletSub: string;
    optBalance: string;
    optChain: string;
    optChainSub: string;
    optCard: string;
    optCardSub: string;
    optUssd: string;
    optUssdSub: string;
    soon: string;
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
    requestedTitle: "Your requests",
    paidTitle: "Paid by you",
    showMore: "Show more",
    statusOpen: "Waiting",
    statusPaid: "Paid",
    statusExpired: "Expired",
    statusCancelled: "Cancelled",
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
    useEmail: "No wallet? Pay from an exchange",
    accountBalance: "Your Karwan balance: {amount} USDC",
    fundTitle: "Send {amount} USDC to pay {name}",
    fundWaiting: "Waiting for your USDC",
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
    payWith: "Pay with",
    optWallet: "Connect a wallet",
    optWalletSub: "Arc, Base, Ethereum and more",
    optBalance: "Your Karwan balance",
    optChain: "Send from any chain",
    optChainSub: "An exchange or any wallet",
    optCard: "Card or bank",
    optCardSub: "Pay in your currency",
    optUssd: "USSD",
    optUssdSub: "From any phone, no data",
    soon: "Coming soon",
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
    requestedTitle: "Vos demandes",
    paidTitle: "Payées par vous",
    showMore: "Afficher plus",
    statusOpen: "En attente",
    statusPaid: "Payée",
    statusExpired: "Expirée",
    statusCancelled: "Annulée",
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
    useEmail: "Pas de portefeuille ? Payez depuis une plateforme d’échange",
    accountBalance: "Votre solde Karwan : {amount} USDC",
    fundTitle: "Envoyez {amount} USDC pour payer {name}",
    fundWaiting: "En attente de vos USDC",
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
    payWith: "Payer avec",
    optWallet: "Connecter un portefeuille",
    optWalletSub: "Arc, Base, Ethereum et plus",
    optBalance: "Votre solde Karwan",
    optChain: "Envoyer depuis n'importe quelle chaîne",
    optChainSub: "Une plateforme d'échange ou tout portefeuille",
    optCard: "Carte ou banque",
    optCardSub: "Payez dans votre devise",
    optUssd: "USSD",
    optUssdSub: "Depuis n'importe quel téléphone, sans données",
    soon: "Bientôt",
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
    requestedTitle: "طلباتك",
    paidTitle: "دفعتها أنت",
    showMore: "عرض المزيد",
    statusOpen: "بانتظار الدفع",
    statusPaid: "مدفوع",
    statusExpired: "منتهي",
    statusCancelled: "ملغى",
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
    useEmail: "لا محفظة؟ ادفع من منصة تداول",
    accountBalance: "رصيدك في Karwan: {amount} USDC",
    fundTitle: "أرسل {amount} USDC للدفع إلى {name}",
    fundWaiting: "في انتظار USDC الخاصة بك",
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
    payWith: "الدفع عبر",
    optWallet: "ربط محفظة",
    optWalletSub: "Arc وBase وEthereum وغيرها",
    optBalance: "رصيدك في Karwan",
    optChain: "الإرسال من أي شبكة",
    optChainSub: "منصة تداول أو أي محفظة",
    optCard: "بطاقة أو بنك",
    optCardSub: "ادفع بعملتك",
    optUssd: "USSD",
    optUssdSub: "من أي هاتف، دون بيانات",
    soon: "قريبًا",
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
    requestedTitle: "आपके अनुरोध",
    paidTitle: "आपने भुगतान किया",
    showMore: "और दिखाएँ",
    statusOpen: "प्रतीक्षा में",
    statusPaid: "भुगतान हुआ",
    statusExpired: "समाप्त",
    statusCancelled: "रद्द",
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
    useEmail: "वॉलेट नहीं है? एक्सचेंज से भुगतान करें",
    accountBalance: "आपका Karwan बैलेंस: {amount} USDC",
    fundTitle: "{name} को भुगतान करने के लिए {amount} USDC भेजें",
    fundWaiting: "आपके USDC का इंतज़ार है",
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
    payWith: "इससे भुगतान करें",
    optWallet: "वॉलेट जोड़ें",
    optWalletSub: "Arc, Base, Ethereum और अन्य",
    optBalance: "आपका Karwan बैलेंस",
    optChain: "किसी भी चेन से भेजें",
    optChainSub: "कोई एक्सचेंज या कोई भी वॉलेट",
    optCard: "कार्ड या बैंक",
    optCardSub: "अपनी मुद्रा में भुगतान करें",
    optUssd: "USSD",
    optUssdSub: "किसी भी फ़ोन से, बिना डेटा",
    soon: "जल्द आ रहा है",
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
    requestedTitle: "Maombi yako",
    paidTitle: "Uliyolipa",
    showMore: "Onyesha zaidi",
    statusOpen: "Inasubiri",
    statusPaid: "Imelipwa",
    statusExpired: "Imeisha muda",
    statusCancelled: "Imeghairiwa",
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
    useEmail: "Huna pochi? Lipa kutoka soko la kubadilisha",
    accountBalance: "Salio lako la Karwan: USDC {amount}",
    fundTitle: "Tuma USDC {amount} ili umlipe {name}",
    fundWaiting: "Tunasubiri USDC yako",
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
    payWith: "Lipa kwa",
    optWallet: "Unganisha pochi",
    optWalletSub: "Arc, Base, Ethereum na zaidi",
    optBalance: "Salio lako la Karwan",
    optChain: "Tuma kutoka mnyororo wowote",
    optChainSub: "Soko la kubadilishana au pochi yoyote",
    optCard: "Kadi au benki",
    optCardSub: "Lipa kwa sarafu yako",
    optUssd: "USSD",
    optUssdSub: "Kutoka simu yoyote, bila data",
    soon: "Inakuja hivi karibuni",
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
  },
};

export const payLinkCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', PayLinkCopy> = { en, ar, fr, hi, sw };
