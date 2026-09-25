export interface EscrowV3Copy {
  unaccepted: {
    title: string;
    buyerBody: string;
    sellerBody: string;
    takeBack: string;
    confirmTitle: string;
    confirmConsequence: string;
  };
  ruling: {
    title: string;
    split: string;
    applies: string;
    reasons: { r1: string; r2: string; r3: string };
    appeal: string;
    confirmTitle: string;
    confirmConsequence: string;
  };
  waiting: {
    title: string;
    body: string;
    escalateFrom: string;
    escalate: string;
    confirmTitle: string;
    confirmConsequence: string;
  };
  review: { title: string; body: string };
  failed: string;
}

const en: EscrowV3Copy = {
  unaccepted: {
    title: 'The seller has not accepted yet',
    buyerBody: 'Your money is held in escrow. You can take it back now.',
    sellerBody: 'The escrow is waiting for your acceptance. It completes when you mark the work delivered.',
    takeBack: 'Take back {amount} USDC',
    confirmTitle: 'Take the money back',
    confirmConsequence: '{amount} USDC returns to your balance and this deal closes.',
  },
  ruling: {
    title: 'Automatic ruling',
    split: '{seller} USDC to the seller, {buyer} USDC to the buyer.',
    applies: 'Applies {date} unless either side appeals.',
    reasons: {
      r1: 'Nothing was delivered by the deadline.',
      r2: 'Delivered on time and the delivery check passed.',
      r3: 'The delivery check failed on this delivery.',
    },
    appeal: 'Appeal to review',
    confirmTitle: 'Appeal the ruling',
    confirmConsequence: 'Karwan reviewers decide instead. They can only split the money between the two of you.',
  },
  waiting: {
    title: 'Waiting for a ruling',
    body: 'The escrow is checking the record of this deal.',
    escalateFrom: 'You can send it to review from {date}.',
    escalate: 'Send to review',
    confirmTitle: 'Send the dispute to review',
    confirmConsequence: 'Karwan reviewers decide. They can only split the money between the two of you.',
  },
  review: {
    title: 'With review',
    body: 'Karwan reviewers are deciding. If nobody rules by {date}, the deal continues where it was.',
  },
  failed: 'That did not go through. Nothing changed.',
};

const fr: EscrowV3Copy = {
  unaccepted: {
    title: "Le vendeur n'a pas encore accepté",
    buyerBody: 'Votre argent est bloqué en séquestre. Vous pouvez le récupérer maintenant.',
    sellerBody: "Le séquestre attend votre acceptation. Elle se fait quand vous marquez le travail livré.",
    takeBack: 'Récupérer {amount} USDC',
    confirmTitle: "Récupérer l'argent",
    confirmConsequence: '{amount} USDC reviennent sur votre solde et cette affaire se clôt.',
  },
  ruling: {
    title: 'Décision automatique',
    split: '{seller} USDC au vendeur, {buyer} USDC à l’acheteur.',
    applies: "S'applique le {date} sauf appel de l'une des parties.",
    reasons: {
      r1: "Rien n'a été livré avant la date limite.",
      r2: 'Livré à temps et la vérification de livraison a réussi.',
      r3: 'La vérification de livraison a échoué pour cette livraison.',
    },
    appeal: 'Faire appel',
    confirmTitle: 'Faire appel de la décision',
    confirmConsequence: "Les vérificateurs de Karwan décident à la place. Ils ne peuvent que répartir l'argent entre vous deux.",
  },
  waiting: {
    title: 'En attente d’une décision',
    body: 'Le séquestre examine le dossier de cette affaire.',
    escalateFrom: 'Vous pourrez le transmettre aux vérificateurs à partir du {date}.',
    escalate: 'Transmettre aux vérificateurs',
    confirmTitle: 'Transmettre le litige',
    confirmConsequence: "Les vérificateurs de Karwan décident. Ils ne peuvent que répartir l'argent entre vous deux.",
  },
  review: {
    title: 'En cours de vérification',
    body: "Les vérificateurs de Karwan décident. Si personne ne tranche avant le {date}, l'affaire reprend où elle en était.",
  },
  failed: "Cela n'a pas abouti. Rien n'a changé.",
};

const ar: EscrowV3Copy = {
  unaccepted: {
    title: 'لم يقبل البائع بعد',
    buyerBody: 'أموالك محفوظة في الضمان. يمكنك استردادها الآن.',
    sellerBody: 'الضمان بانتظار قبولك. يكتمل القبول عندما تحدد أن العمل قد سُلّم.',
    takeBack: 'استرداد {amount} USDC',
    confirmTitle: 'استرداد الأموال',
    confirmConsequence: 'تعود {amount} USDC إلى رصيدك وتُغلق هذه الصفقة.',
  },
  ruling: {
    title: 'حكم تلقائي',
    split: '{seller} USDC للبائع، و{buyer} USDC للمشتري.',
    applies: 'يُطبّق في {date} ما لم يستأنف أحد الطرفين.',
    reasons: {
      r1: 'لم يُسلَّم شيء قبل الموعد النهائي.',
      r2: 'سُلّم في الموعد ونجح فحص التسليم.',
      r3: 'فشل فحص التسليم لهذا التسليم.',
    },
    appeal: 'الاستئناف للمراجعة',
    confirmTitle: 'استئناف الحكم',
    confirmConsequence: 'يقرر مراجعو Karwan بدلاً من ذلك. لا يمكنهم سوى تقسيم المال بينكما.',
  },
  waiting: {
    title: 'بانتظار الحكم',
    body: 'يراجع الضمان سجل هذه الصفقة.',
    escalateFrom: 'يمكنك إرساله للمراجعة ابتداءً من {date}.',
    escalate: 'إرسال للمراجعة',
    confirmTitle: 'إرسال النزاع للمراجعة',
    confirmConsequence: 'يقرر مراجعو Karwan. لا يمكنهم سوى تقسيم المال بينكما.',
  },
  review: {
    title: 'قيد المراجعة',
    body: 'يقرر مراجعو Karwan الآن. إذا لم يصدر حكم بحلول {date}، تستمر الصفقة من حيث توقفت.',
  },
  failed: 'لم تتم العملية. لم يتغير شيء.',
};

const hi: EscrowV3Copy = {
  unaccepted: {
    title: 'विक्रेता ने अभी स्वीकार नहीं किया है',
    buyerBody: 'आपका पैसा एस्क्रो में सुरक्षित है। आप इसे अभी वापस ले सकते हैं।',
    sellerBody: 'एस्क्रो आपकी स्वीकृति की प्रतीक्षा में है। काम डिलीवर चिह्नित करते ही यह पूरी हो जाती है।',
    takeBack: '{amount} USDC वापस लें',
    confirmTitle: 'पैसा वापस लें',
    confirmConsequence: '{amount} USDC आपके बैलेंस में लौट आएंगे और यह डील बंद हो जाएगी।',
  },
  ruling: {
    title: 'स्वचालित निर्णय',
    split: 'विक्रेता को {seller} USDC, खरीदार को {buyer} USDC।',
    applies: '{date} को लागू होगा, जब तक कोई पक्ष अपील न करे।',
    reasons: {
      r1: 'समय सीमा तक कुछ भी डिलीवर नहीं हुआ।',
      r2: 'समय पर डिलीवर हुआ और डिलीवरी जांच पास हुई।',
      r3: 'इस डिलीवरी की जांच विफल रही।',
    },
    appeal: 'समीक्षा के लिए अपील करें',
    confirmTitle: 'निर्णय के विरुद्ध अपील करें',
    confirmConsequence: 'इसके बजाय Karwan समीक्षक निर्णय लेंगे। वे पैसा केवल आप दोनों के बीच बांट सकते हैं।',
  },
  waiting: {
    title: 'निर्णय की प्रतीक्षा',
    body: 'एस्क्रो इस डील का रिकॉर्ड जांच रहा है।',
    escalateFrom: 'आप इसे {date} से समीक्षा के लिए भेज सकते हैं।',
    escalate: 'समीक्षा के लिए भेजें',
    confirmTitle: 'विवाद को समीक्षा के लिए भेजें',
    confirmConsequence: 'Karwan समीक्षक निर्णय लेंगे। वे पैसा केवल आप दोनों के बीच बांट सकते हैं।',
  },
  review: {
    title: 'समीक्षा में',
    body: 'Karwan समीक्षक निर्णय ले रहे हैं। यदि {date} तक कोई निर्णय नहीं होता, तो डील वहीं से जारी रहेगी।',
  },
  failed: 'यह पूरा नहीं हुआ। कुछ नहीं बदला।',
};

const sw: EscrowV3Copy = {
  unaccepted: {
    title: 'Muuzaji bado hajakubali',
    buyerBody: 'Pesa yako imeshikiliwa kwenye escrow. Unaweza kuirudisha sasa.',
    sellerBody: 'Escrow inasubiri ukubali. Inakamilika unapoweka alama kuwa kazi imewasilishwa.',
    takeBack: 'Rudisha {amount} USDC',
    confirmTitle: 'Rudisha pesa',
    confirmConsequence: '{amount} USDC zinarudi kwenye salio lako na mpango huu unafungwa.',
  },
  ruling: {
    title: 'Uamuzi wa moja kwa moja',
    split: '{seller} USDC kwa muuzaji, {buyer} USDC kwa mnunuzi.',
    applies: 'Unatumika {date} isipokuwa upande mmoja ukate rufaa.',
    reasons: {
      r1: 'Hakuna kilichowasilishwa kabla ya tarehe ya mwisho.',
      r2: 'Kiliwasilishwa kwa wakati na ukaguzi wa uwasilishaji ulipita.',
      r3: 'Ukaguzi wa uwasilishaji huu ulishindwa.',
    },
    appeal: 'Kata rufaa kwa ukaguzi',
    confirmTitle: 'Kata rufaa dhidi ya uamuzi',
    confirmConsequence: 'Wakaguzi wa Karwan wataamua badala yake. Wanaweza tu kugawa pesa kati yenu wawili.',
  },
  waiting: {
    title: 'Inasubiri uamuzi',
    body: 'Escrow inakagua rekodi ya mpango huu.',
    escalateFrom: 'Unaweza kuutuma kwa ukaguzi kuanzia {date}.',
    escalate: 'Tuma kwa ukaguzi',
    confirmTitle: 'Tuma mgogoro kwa ukaguzi',
    confirmConsequence: 'Wakaguzi wa Karwan wataamua. Wanaweza tu kugawa pesa kati yenu wawili.',
  },
  review: {
    title: 'Katika ukaguzi',
    body: 'Wakaguzi wa Karwan wanaamua. Mtu asipoamua kufikia {date}, mpango unaendelea pale ulipokuwa.',
  },
  failed: 'Haikufanikiwa. Hakuna kilichobadilika.',
};

export const escrowV3Copy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', EscrowV3Copy> = { en, ar, fr, hi, sw };
