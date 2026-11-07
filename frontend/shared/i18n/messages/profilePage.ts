/// Profile, what others see, something is wrong, and an open problem (view 44, Batch 8).
export interface ProfilePageCopy {
  yourRecord: string;
  completed: string;
  completedOne: string;
  onTime: string;
  problemsLost: string;
  problemsLostOne: string;
  noProblems: string;
  newHere: string;
  share: string;
  record: string;
  selling: string;
  /// Buying, selling and the money flow in one group (owner notes, 3 Nov 2026).
  tradeAndMoney: string;
  buying: string;
  openRequests: string;
  openRequestsOne: string;
  liveOffers: string;
  liveOffersOne: string;
  accountAndSecurity: string;
  balance: string;
  withAgents: string;
  statCompleted: string;
  statCompletedOne: string;
  statOnTime: string;
  statRatings: string;
  statProblems: string;
  statProblemsOne: string;
  yourOffers: string;
  howAgentSells: string;
  publicView: string;
  whatTheySell: string;
  wrongTitle: string;
  needsChanges: string;
  needsChangesLine: string;
  notAgreed: string;
  notAgreedLine: string;
  nothingArrived: string;
  nothingArrivedLine: string;
  problemOpened: string;
  theyOpened: string;
  karwanDecides: string;
  heldUntil: string;
  silentLine: string;
}

export const profilePageCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', ProfilePageCopy> = {
  en: {
    yourRecord: 'Your record',
    completed: '{n} deals completed',
    completedOne: '1 deal completed',
    onTime: '{pct}% on time',
    problemsLost: '{n} problems lost',
    problemsLostOne: '1 problem lost',
    noProblems: 'No problems lost',
    newHere: 'New on Karwan',
    share: 'Share your record',
    record: 'Record',
    selling: 'Selling',
    tradeAndMoney: 'Trade and money',
    buying: 'Buying',
    openRequests: '{n} open',
    openRequestsOne: '1 open',
    liveOffers: '{n} live',
    liveOffersOne: '1 live',
    accountAndSecurity: 'Account and security',
    balance: 'Balance',
    withAgents: 'With your agents',
    statCompleted: 'deals completed',
    statCompletedOne: 'deal completed',
    statOnTime: 'on time',
    statRatings: 'from {n} ratings',
    statProblems: 'problems lost',
    statProblemsOne: 'problem lost',
    yourOffers: 'Your offers',
    howAgentSells: 'How your agent sells',
    publicView: 'What others see',
    whatTheySell: 'What {name} sells',
    wrongTitle: 'Something is wrong',
    needsChanges: 'It needs changes',
    needsChangesLine: 'Ask {name} to fix something',
    notAgreed: 'It is not what we agreed',
    notAgreedLine: 'Open a problem and Karwan checks it',
    nothingArrived: 'Nothing arrived',
    nothingArrivedLine: 'Get your money back or open a problem',
    problemOpened: 'You opened a problem',
    theyOpened: '{name} opened a problem',
    karwanDecides: 'Karwan decides',
    heldUntil: '{amount} USDC held by Karwan until it is decided',
    silentLine: 'If {name} does not answer by {date}, Karwan returns the money to you after a check.',
  },
  fr: {
    yourRecord: 'Votre historique',
    completed: '{n} transactions terminées',
    completedOne: '1 transaction terminée',
    onTime: '{pct} % à l’heure',
    problemsLost: '{n} problèmes perdus',
    problemsLostOne: '1 problème perdu',
    noProblems: 'Aucun problème perdu',
    newHere: 'Nouveau sur Karwan',
    share: 'Partager votre historique',
    record: 'Historique',
    selling: 'Vente',
    tradeAndMoney: 'Échanges et argent',
    buying: 'Achats',
    openRequests: '{n} ouvertes',
    openRequestsOne: '1 ouverte',
    liveOffers: '{n} en ligne',
    liveOffersOne: '1 en ligne',
    accountAndSecurity: 'Compte et sécurité',
    balance: 'Solde',
    withAgents: 'Chez vos agents',
    statCompleted: 'transactions terminées',
    statCompletedOne: 'transaction terminée',
    statOnTime: 'à l’heure',
    statRatings: 'sur {n} avis',
    statProblems: 'problèmes perdus',
    statProblemsOne: 'problème perdu',
    yourOffers: 'Vos offres',
    howAgentSells: 'Comment votre agent vend',
    publicView: 'Ce que les autres voient',
    whatTheySell: 'Ce que vend {name}',
    wrongTitle: 'Un problème',
    needsChanges: 'Il faut des modifications',
    needsChangesLine: 'Demandez à {name} de corriger quelque chose',
    notAgreed: 'Ce n’est pas ce qui était convenu',
    notAgreedLine: 'Signalez un problème et Karwan vérifie',
    nothingArrived: 'Rien n’est arrivé',
    nothingArrivedLine: 'Récupérez votre argent ou signalez un problème',
    problemOpened: 'Vous avez signalé un problème',
    theyOpened: '{name} a signalé un problème',
    karwanDecides: 'Karwan décide',
    heldUntil: '{amount} USDC gardés par Karwan jusqu’à la décision',
    silentLine: 'Si {name} ne répond pas avant le {date}, Karwan vous rend l’argent après vérification.',
  },
  ar: {
    yourRecord: 'سجلّك',
    completed: '{n} صفقات مكتملة',
    completedOne: 'صفقة واحدة مكتملة',
    onTime: '{pct}% في الموعد',
    problemsLost: '{n} مشكلات خاسرة',
    problemsLostOne: 'مشكلة واحدة خاسرة',
    noProblems: 'لا مشكلات خاسرة',
    newHere: 'جديد على كاروان',
    share: 'شارك سجلّك',
    record: 'السجل',
    selling: 'البيع',
    tradeAndMoney: 'التجارة والمال',
    buying: 'الشراء',
    openRequests: '{n} مفتوحة',
    openRequestsOne: 'واحد مفتوح',
    liveOffers: '{n} معروضة',
    liveOffersOne: 'واحد معروض',
    accountAndSecurity: 'الحساب والأمان',
    balance: 'الرصيد',
    withAgents: 'لدى وكلائك',
    statCompleted: 'صفقات مكتملة',
    statCompletedOne: 'صفقة مكتملة',
    statOnTime: 'في الموعد',
    statRatings: 'من {n} تقييمات',
    statProblems: 'مشكلات خسرتها',
    statProblemsOne: 'مشكلة خسرتها',
    yourOffers: 'عروضك',
    howAgentSells: 'كيف يبيع وكيلك',
    publicView: 'ما يراه الآخرون',
    whatTheySell: 'ما يبيعه {name}',
    wrongTitle: 'هناك مشكلة',
    needsChanges: 'يحتاج إلى تعديلات',
    needsChangesLine: 'اطلب من {name} إصلاح شيء ما',
    notAgreed: 'ليس ما اتفقنا عليه',
    notAgreedLine: 'أبلغ عن مشكلة وستتحقق كاروان',
    nothingArrived: 'لم يصل شيء',
    nothingArrivedLine: 'استرجع مالك أو أبلغ عن مشكلة',
    problemOpened: 'أبلغتَ عن مشكلة',
    theyOpened: 'أبلغ {name} عن مشكلة',
    karwanDecides: 'كاروان تقرر',
    heldUntil: 'تحتفظ كاروان بـ {amount} USDC حتى يُتخذ القرار',
    silentLine: 'إذا لم يرد {name} بحلول {date}، تعيد كاروان المال إليك بعد التحقق.',
  },
  hi: {
    yourRecord: 'आपका रिकॉर्ड',
    completed: '{n} डील पूरी',
    completedOne: '1 डील पूरी',
    onTime: '{pct}% समय पर',
    problemsLost: '{n} समस्याएँ हारीं',
    problemsLostOne: '1 समस्या हारी',
    noProblems: 'कोई समस्या नहीं हारी',
    newHere: 'Karwan पर नए',
    share: 'अपना रिकॉर्ड साझा करें',
    record: 'रिकॉर्ड',
    selling: 'बिक्री',
    tradeAndMoney: 'व्यापार और पैसा',
    buying: 'ख़रीद',
    openRequests: '{n} खुले',
    openRequestsOne: '1 खुला',
    liveOffers: '{n} चालू',
    liveOffersOne: '1 चालू',
    accountAndSecurity: 'खाता और सुरक्षा',
    balance: 'बैलेंस',
    withAgents: 'आपके एजेंटों के पास',
    statCompleted: 'डील पूरी हुईं',
    statCompletedOne: 'डील पूरी हुई',
    statOnTime: 'समय पर',
    statRatings: '{n} रेटिंग से',
    statProblems: 'समस्याएँ हारीं',
    statProblemsOne: 'समस्या हारी',
    yourOffers: 'आपके ऑफ़र',
    howAgentSells: 'आपका एजेंट कैसे बेचता है',
    publicView: 'दूसरे क्या देखते हैं',
    whatTheySell: '{name} क्या बेचते हैं',
    wrongTitle: 'कुछ गड़बड़ है',
    needsChanges: 'बदलाव चाहिए',
    needsChangesLine: '{name} से कुछ ठीक करने को कहें',
    notAgreed: 'यह तय की गई बात नहीं है',
    notAgreedLine: 'समस्या दर्ज करें, Karwan जाँचेगा',
    nothingArrived: 'कुछ नहीं पहुँचा',
    nothingArrivedLine: 'अपना पैसा वापस लें या समस्या दर्ज करें',
    problemOpened: 'आपने समस्या दर्ज की',
    theyOpened: '{name} ने समस्या दर्ज की',
    karwanDecides: 'Karwan फ़ैसला करता है',
    heldUntil: 'फ़ैसले तक {amount} USDC Karwan के पास',
    silentLine: 'अगर {name} {date} तक जवाब नहीं देते, तो Karwan जाँच के बाद पैसा आपको लौटा देगा।',
  },
  sw: {
    yourRecord: 'Rekodi yako',
    completed: 'Mipango {n} imekamilika',
    completedOne: 'Mpango 1 umekamilika',
    onTime: '{pct}% kwa wakati',
    problemsLost: 'Matatizo {n} yamepotezwa',
    problemsLostOne: 'Tatizo 1 limepotezwa',
    noProblems: 'Hakuna tatizo lililopotezwa',
    newHere: 'Mpya kwenye Karwan',
    share: 'Shiriki rekodi yako',
    record: 'Rekodi',
    selling: 'Kuuza',
    tradeAndMoney: 'Biashara na pesa',
    buying: 'Kununua',
    openRequests: '{n} wazi',
    openRequestsOne: '1 wazi',
    liveOffers: '{n} hai',
    liveOffersOne: '1 hai',
    accountAndSecurity: 'Akaunti na usalama',
    balance: 'Salio',
    withAgents: 'Kwa mawakala wako',
    statCompleted: 'mipango iliyokamilika',
    statCompletedOne: 'mpango uliokamilika',
    statOnTime: 'kwa wakati',
    statRatings: 'kutoka tathmini {n}',
    statProblems: 'matatizo yaliyopotezwa',
    statProblemsOne: 'tatizo lililopotezwa',
    yourOffers: 'Ofa zako',
    howAgentSells: 'Jinsi wakala wako anavyouza',
    publicView: 'Wengine wanachoona',
    whatTheySell: 'Anachouza {name}',
    wrongTitle: 'Kuna tatizo',
    needsChanges: 'Kinahitaji mabadiliko',
    needsChangesLine: 'Muombe {name} arekebishe kitu',
    notAgreed: 'Si kile tulichokubaliana',
    notAgreedLine: 'Ripoti tatizo na Karwan italikagua',
    nothingArrived: 'Hakuna kilichofika',
    nothingArrivedLine: 'Rudishiwa pesa yako au ripoti tatizo',
    problemOpened: 'Umeripoti tatizo',
    theyOpened: '{name} ameripoti tatizo',
    karwanDecides: 'Karwan inaamua',
    heldUntil: 'USDC {amount} zinashikiliwa na Karwan hadi uamuzi',
    silentLine: '{name} asipojibu kufikia {date}, Karwan itakurudishia pesa baada ya ukaguzi.',
  },
};
