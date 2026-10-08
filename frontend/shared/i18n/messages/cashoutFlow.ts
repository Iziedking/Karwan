/// The cash-out page: a seller's earnings from one deal, where they go, the
/// steps while they move, and the receipt.
export interface CashoutFlowCopy {
  back: string;
  earnings: string;
  from: string;
  fromSeller: string;
  fromBuyer: string;
  fromMain: string;
  inWallet: string;
  sendTo: string;
  optBalance: string;
  optBalanceSub: string;
  optWallet: string;
  optWalletSub: string;
  optBank: string;
  optBankSub: string;
  soon: string;
  network: string;
  address: string;
  addressArc: string;
  invalidAddress: string;
  noTag: string;
  amount: string;
  max: string;
  overBalance: string;
  moveCta: string;
  sendCta: string;
  sendChainCta: string;
  connect: string;
  landsSeconds: string;
  landsMinute: string;
  nothingLeft: string;
  notReadyTitle: string;
  notReadyBody: string;
  openDeal: string;
  legacyBody: string;
  failed: string;
  receiptKind: string;
  sentBadge: string;
  sentence: string;
  yourBalance: string;
  rowTo: string;
  rowNetwork: string;
  rowDate: string;
  rowRef: string;
  saveReceipt: string;
  loadError: string;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const cashoutFlowCopy: Record<Locale, CashoutFlowCopy> = {
  en: {
    back: 'Back to deal',
    earnings: 'Your earnings from this deal',
    from: "From",
    fromSeller: "Seller agent",
    fromBuyer: "Buyer agent",
    fromMain: "Main wallet",
    inWallet: 'Your earnings landed in your wallet on Arc. Send them anywhere from here.',
    sendTo: 'Send to',
    optBalance: 'Your Karwan balance',
    optBalanceSub: 'On Arc, ready to spend',
    optWallet: 'Another wallet',
    optWalletSub: 'Arc, Base, Ethereum and more',
    optBank: 'Bank or local currency',
    optBankSub: 'NGN, KES, INR and more',
    soon: 'Coming soon',
    network: 'Network',
    address: 'Address',
    addressArc: 'Address or Karwan tag',
    invalidAddress: "That doesn't look like an address on {chain}.",
    noTag: 'No Karwan account has that tag.',
    amount: 'Amount',
    max: 'Max {amount}',
    overBalance: 'More than the {amount} USDC available.',
    moveCta: 'Move {amount} USDC',
    sendCta: 'Send {amount} USDC',
    sendChainCta: 'Send {amount} USDC to {chain}',
    connect: 'Connect your wallet',
    landsSeconds: 'Lands in seconds',
    landsMinute: 'Usually arrives in under a minute',
    nothingLeft: 'Nothing left to cash out from this deal.',
    notReadyTitle: 'Not released yet',
    notReadyBody: 'Come back once the buyer releases the payment.',
    openDeal: 'Open the deal',
    legacyBody: 'This deal settled on an older contract. Contact support to move these earnings.',
    failed: 'That did not go through. Try again.',
    receiptKind: 'Cash-out receipt',
    sentBadge: 'Sent',
    sentence: 'Sent {amount} USDC to {to}',
    yourBalance: 'your Karwan balance',
    rowTo: 'To',
    rowNetwork: 'Network',
    rowDate: 'Date',
    rowRef: 'Reference',
    saveReceipt: 'Save receipt',
    loadError: 'Could not load this deal. Try again.',
  },
  fr: {
    back: 'Retour à la transaction',
    earnings: 'Vos gains sur cette transaction',
    from: "Depuis",
    fromSeller: "Agent vendeur",
    fromBuyer: "Agent acheteur",
    fromMain: "Portefeuille principal",
    inWallet: 'Vos gains sont arrivés dans votre portefeuille sur Arc. Envoyez-les où vous voulez depuis ici.',
    sendTo: 'Envoyer vers',
    optBalance: 'Votre solde Karwan',
    optBalanceSub: 'Sur Arc, prêt à dépenser',
    optWallet: 'Un autre portefeuille',
    optWalletSub: 'Arc, Base, Ethereum et plus',
    optBank: 'Banque ou devise locale',
    optBankSub: 'NGN, KES, INR et plus',
    soon: 'Bientôt',
    network: 'Réseau',
    address: 'Adresse',
    addressArc: 'Adresse ou tag Karwan',
    invalidAddress: "Cela ne ressemble pas à une adresse sur {chain}.",
    noTag: "Aucun compte Karwan n'a ce tag.",
    amount: 'Montant',
    max: 'Max {amount}',
    overBalance: 'Plus que les {amount} USDC disponibles.',
    moveCta: 'Transférer {amount} USDC',
    sendCta: 'Envoyer {amount} USDC',
    sendChainCta: 'Envoyer {amount} USDC vers {chain}',
    connect: 'Connectez votre portefeuille',
    landsSeconds: 'Arrive en quelques secondes',
    landsMinute: "Arrive généralement en moins d'une minute",
    nothingLeft: 'Plus rien à encaisser sur cette transaction.',
    notReadyTitle: 'Pas encore libéré',
    notReadyBody: "Revenez quand l'acheteur aura libéré le paiement.",
    openDeal: 'Ouvrir la transaction',
    legacyBody: "Cette transaction a été réglée sur un ancien contrat. Contactez l'assistance pour transférer ces gains.",
    failed: "Ça n'a pas abouti. Réessayez.",
    receiptKind: "Reçu d'encaissement",
    sentBadge: 'Envoyé',
    sentence: '{amount} USDC envoyés à {to}',
    yourBalance: 'votre solde Karwan',
    rowTo: 'À',
    rowNetwork: 'Réseau',
    rowDate: 'Date',
    rowRef: 'Référence',
    saveReceipt: 'Enregistrer le reçu',
    loadError: 'Impossible de charger cette transaction. Réessayez.',
  },
  ar: {
    back: 'العودة إلى الصفقة',
    earnings: 'أرباحك من هذه الصفقة',
    from: "من",
    fromSeller: "وكيل البيع",
    fromBuyer: "وكيل الشراء",
    fromMain: "المحفظة الرئيسية",
    inWallet: 'وصلت أرباحك إلى محفظتك على Arc. أرسلها إلى أي مكان من هنا.',
    sendTo: 'إرسال إلى',
    optBalance: 'رصيدك في Karwan',
    optBalanceSub: 'على Arc، جاهز للإنفاق',
    optWallet: 'محفظة أخرى',
    optWalletSub: 'Arc وBase وEthereum وغيرها',
    optBank: 'بنك أو عملة محلية',
    optBankSub: 'NGN وKES وINR وغيرها',
    soon: 'قريبًا',
    network: 'الشبكة',
    address: 'العنوان',
    addressArc: 'العنوان أو وسم Karwan',
    invalidAddress: 'لا يبدو هذا عنوانًا على {chain}.',
    noTag: 'لا يوجد حساب Karwan بهذا الوسم.',
    amount: 'المبلغ',
    max: 'الحد الأقصى {amount}',
    overBalance: 'أكثر من {amount} USDC المتاحة.',
    moveCta: 'نقل {amount} USDC',
    sendCta: 'إرسال {amount} USDC',
    sendChainCta: 'إرسال {amount} USDC إلى {chain}',
    connect: 'اربط محفظتك',
    landsSeconds: 'يصل خلال ثوانٍ',
    landsMinute: 'يصل عادةً في أقل من دقيقة',
    nothingLeft: 'لم يتبقَّ شيء لسحبه من هذه الصفقة.',
    notReadyTitle: 'لم يُفرج عنه بعد',
    notReadyBody: 'عد بعد أن يُفرج المشتري عن الدفعة.',
    openDeal: 'فتح الصفقة',
    legacyBody: 'سُوّيت هذه الصفقة على عقد قديم. تواصل مع الدعم لنقل هذه الأرباح.',
    failed: 'لم تكتمل العملية. حاول مرة أخرى.',
    receiptKind: 'إيصال سحب',
    sentBadge: 'أُرسل',
    sentence: 'أُرسل {amount} USDC إلى {to}',
    yourBalance: 'رصيدك في Karwan',
    rowTo: 'إلى',
    rowNetwork: 'الشبكة',
    rowDate: 'التاريخ',
    rowRef: 'المرجع',
    saveReceipt: 'حفظ الإيصال',
    loadError: 'تعذر تحميل هذه الصفقة. حاول مرة أخرى.',
  },
  hi: {
    back: 'डील पर वापस',
    earnings: 'इस डील से आपकी कमाई',
    from: "यहाँ से",
    fromSeller: "विक्रेता एजेंट",
    fromBuyer: "खरीदार एजेंट",
    fromMain: "मुख्य वॉलेट",
    inWallet: 'आपकी कमाई Arc पर आपके वॉलेट में आ गई है। यहाँ से इसे कहीं भी भेजें।',
    sendTo: 'यहाँ भेजें',
    optBalance: 'आपका Karwan बैलेंस',
    optBalanceSub: 'Arc पर, खर्च के लिए तैयार',
    optWallet: 'दूसरा वॉलेट',
    optWalletSub: 'Arc, Base, Ethereum और अन्य',
    optBank: 'बैंक या स्थानीय मुद्रा',
    optBankSub: 'NGN, KES, INR और अन्य',
    soon: 'जल्द आ रहा है',
    network: 'नेटवर्क',
    address: 'पता',
    addressArc: 'पता या Karwan टैग',
    invalidAddress: 'यह {chain} पर पता नहीं लगता।',
    noTag: 'इस टैग वाला कोई Karwan खाता नहीं है।',
    amount: 'राशि',
    max: 'अधिकतम {amount}',
    overBalance: 'उपलब्ध {amount} USDC से ज़्यादा।',
    moveCta: '{amount} USDC ले जाएँ',
    sendCta: '{amount} USDC भेजें',
    sendChainCta: '{chain} पर {amount} USDC भेजें',
    connect: 'अपना वॉलेट जोड़ें',
    landsSeconds: 'सेकंडों में पहुँचता है',
    landsMinute: 'आमतौर पर एक मिनट से कम में पहुँचता है',
    nothingLeft: 'इस डील से निकालने के लिए कुछ नहीं बचा।',
    notReadyTitle: 'अभी जारी नहीं हुआ',
    notReadyBody: 'खरीदार के भुगतान जारी करने के बाद लौटें।',
    openDeal: 'डील खोलें',
    legacyBody: 'यह डील एक पुराने कॉन्ट्रैक्ट पर सेटल हुई। यह कमाई ले जाने के लिए सहायता से संपर्क करें।',
    failed: 'यह पूरा नहीं हुआ। फिर से कोशिश करें।',
    receiptKind: 'कैश-आउट रसीद',
    sentBadge: 'भेजा गया',
    sentence: '{to} को {amount} USDC भेजे गए',
    yourBalance: 'आपका Karwan बैलेंस',
    rowTo: 'किसे',
    rowNetwork: 'नेटवर्क',
    rowDate: 'तारीख़',
    rowRef: 'संदर्भ',
    saveReceipt: 'रसीद सहेजें',
    loadError: 'यह डील लोड नहीं हो सकी। फिर से कोशिश करें।',
  },
  sw: {
    back: 'Rudi kwenye mpango',
    earnings: 'Mapato yako kutoka mpango huu',
    from: "Kutoka",
    fromSeller: "Wakala wa muuzaji",
    fromBuyer: "Wakala wa mnunuzi",
    fromMain: "Pochi kuu",
    inWallet: 'Mapato yako yamefika kwenye pochi yako kwenye Arc. Yatume popote kutoka hapa.',
    sendTo: 'Tuma kwa',
    optBalance: 'Salio lako la Karwan',
    optBalanceSub: 'Kwenye Arc, tayari kutumika',
    optWallet: 'Pochi nyingine',
    optWalletSub: 'Arc, Base, Ethereum na zaidi',
    optBank: 'Benki au sarafu ya ndani',
    optBankSub: 'NGN, KES, INR na zaidi',
    soon: 'Inakuja hivi karibuni',
    network: 'Mtandao',
    address: 'Anwani',
    addressArc: 'Anwani au tagi ya Karwan',
    invalidAddress: 'Hii haionekani kama anwani kwenye {chain}.',
    noTag: 'Hakuna akaunti ya Karwan yenye tagi hiyo.',
    amount: 'Kiasi',
    max: 'Juu kabisa {amount}',
    overBalance: 'Zaidi ya USDC {amount} zilizopo.',
    moveCta: 'Hamisha USDC {amount}',
    sendCta: 'Tuma USDC {amount}',
    sendChainCta: 'Tuma USDC {amount} kwenda {chain}',
    connect: 'Unganisha pochi yako',
    landsSeconds: 'Inafika kwa sekunde',
    landsMinute: 'Kwa kawaida inafika chini ya dakika moja',
    nothingLeft: 'Hakuna kilichobaki cha kutoa kutoka mpango huu.',
    notReadyTitle: 'Bado haijatolewa',
    notReadyBody: 'Rudi mnunuzi akishatoa malipo.',
    openDeal: 'Fungua mpango',
    legacyBody: 'Mpango huu ulikamilishwa kwenye mkataba wa zamani. Wasiliana na msaada kuhamisha mapato haya.',
    failed: 'Haikufanikiwa. Jaribu tena.',
    receiptKind: 'Risiti ya kutoa pesa',
    sentBadge: 'Imetumwa',
    sentence: 'Imetumwa USDC {amount} kwa {to}',
    yourBalance: 'salio lako la Karwan',
    rowTo: 'Kwa',
    rowNetwork: 'Mtandao',
    rowDate: 'Tarehe',
    rowRef: 'Rejea',
    saveReceipt: 'Hifadhi risiti',
    loadError: 'Imeshindwa kupakia mpango huu. Jaribu tena.',
  },
};
