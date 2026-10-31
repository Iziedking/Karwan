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
  answersBy: string;
  answerPassed: string;
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
    answersBy: '{name} answers by {date}',
    answerPassed: 'The answer date passed. Karwan is checking',
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
    answersBy: '{name} répond avant le {date}',
    answerPassed: 'La date de réponse est passée. Karwan vérifie',
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
    answersBy: 'يرد {name} بحلول {date}',
    answerPassed: 'انقضى موعد الرد. كاروان تتحقق',
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
    answersBy: '{name} {date} तक जवाब देंगे',
    answerPassed: 'जवाब की तारीख निकल गई। Karwan जाँच रहा है',
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
    answersBy: '{name} atajibu kufikia {date}',
    answerPassed: 'Tarehe ya kujibu imepita. Karwan inakagua',
    karwanDecides: 'Karwan inaamua',
    heldUntil: 'USDC {amount} zinashikiliwa na Karwan hadi uamuzi',
    silentLine: '{name} asipojibu kufikia {date}, Karwan itakurudishia pesa baada ya ukaguzi.',
  },
};
