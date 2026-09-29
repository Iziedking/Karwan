export interface OffersCopy {
  makeOffer: string;
  sheetTitle: string;
  price: string;
  deliverBy: string;
  note: string;
  notePlaceholder: string;
  noteCount: string;
  explainer: string;
  send: string;
  sending: string;
  sent: string;
  sentDetail: string;
  withdraw: string;
  signIn: string;
  countNone: string;
  countOne: string;
  countMany: string;
  listTitle: string;
  closestMatch: string;
  agentLine: string;
  accept: string;
  acceptShort: string;
  confirmTitle: string;
  confirmBody: string;
  aboveBudget: string;
  includesFee: string;
  topUpCta: string;
  cancel: string;
  accepted: string;
  noRecord: string;
  deliverByOn: string;
  requestLabel: string;
  budget: string;
  due: string;
  offersLabel: string;
  moneyLabel: string;
  moneyHeld: string;
  activateLink: string;
  errors: {
    ownRequest: string;
    closed: string;
    price: string;
    priceHigh: string;
    datePast: string;
    dateLate: string;
    noteLong: string;
    activate: string;
    lapsed: string;
    topUp: string;
    alreadyBidding: string;
    busy: string;
    matched: string;
    generic: string;
  };
}

const en: OffersCopy = {
  makeOffer: 'Make an offer',
  sheetTitle: 'Your offer',
  price: 'Price',
  deliverBy: 'Deliver by',
  note: 'Note to the buyer',
  notePlaceholder: 'What you will deliver and when',
  noteCount: '{n} of 280',
  explainer: 'The buyer sees your record next to your offer. If they accept, the money is held before you start.',
  send: 'Send offer',
  sending: 'Sending',
  sent: 'Offer sent',
  sentDetail: '{price} USDC · deliver by {date}',
  withdraw: 'Withdraw offer',
  signIn: 'Sign in to make an offer',
  countNone: 'No offers yet',
  countOne: '1 offer',
  countMany: '{n} offers',
  listTitle: '{n} offers',
  closestMatch: 'Closest match to your brief',
  agentLine: 'Sorted by price. You decide.',
  accept: 'Accept {seller} · {price} USDC',
  acceptShort: 'Accept',
  confirmTitle: 'Accept this offer',
  confirmBody: '{price} USDC is held until you approve the work.',
  aboveBudget: '{diff} USDC above your budget',
  includesFee: '{price} USDC offer plus the fee',
  topUpCta: 'Top up {amount} USDC',
  cancel: 'Cancel',
  accepted: 'Offer accepted. The money is held.',
  noRecord: 'No record yet',
  deliverByOn: 'Deliver by {date}',
  requestLabel: 'Request',
  budget: 'Budget',
  due: 'Due',
  offersLabel: 'Offers',
  moneyLabel: 'Money',
  moneyHeld: 'Held before work starts',
  activateLink: 'Set it up',
  errors: {
    ownRequest: 'This is your own request.',
    closed: 'This request is closed.',
    price: 'Enter a price in USDC.',
    priceHigh: 'That price is far above the budget.',
    datePast: 'Pick a date in the future.',
    dateLate: 'Pick a date closer to the request deadline.',
    noteLong: 'Keep the note under 280 characters.',
    activate: 'Set up your seller agent to make offers.',
    lapsed: 'This offer has expired.',
    topUp: 'Top up to accept this offer.',
    alreadyBidding: 'Your agent is already bidding on this request.',
    busy: 'Another step on this request is running. Try again in a moment.',
    matched: 'This request already has an accepted offer.',
    generic: 'That did not go through. Try again.',
  },
};

const ar: OffersCopy = {
  makeOffer: 'قدّم عرضًا',
  sheetTitle: 'عرضك',
  price: 'السعر',
  deliverBy: 'التسليم بحلول',
  note: 'ملاحظة للمشتري',
  notePlaceholder: 'ما الذي ستسلّمه ومتى',
  noteCount: '{n} من 280',
  explainer: 'يرى المشتري سجلك بجانب عرضك. إذا قبل، تُحجز الأموال قبل أن تبدأ.',
  send: 'أرسل العرض',
  sending: 'جارٍ الإرسال',
  sent: 'تم إرسال العرض',
  sentDetail: '{price} USDC · التسليم بحلول {date}',
  withdraw: 'اسحب العرض',
  signIn: 'سجّل الدخول لتقديم عرض',
  countNone: 'لا توجد عروض بعد',
  countOne: 'عرض واحد',
  countMany: '{n} عروض',
  listTitle: '{n} عروض',
  closestMatch: 'الأقرب إلى طلبك',
  agentLine: 'مرتّبة حسب السعر. والقرار لك.',
  accept: 'اقبل {seller} · {price} USDC',
  acceptShort: 'اقبل',
  confirmTitle: 'اقبل هذا العرض',
  confirmBody: 'يُحجز {price} USDC حتى توافق على العمل.',
  aboveBudget: '{diff} USDC فوق ميزانيتك',
  includesFee: 'عرض بقيمة {price} USDC مع الرسوم',
  topUpCta: 'اشحن بمبلغ {amount} USDC',
  cancel: 'إلغاء',
  accepted: 'تم قبول العرض. الأموال محجوزة.',
  noRecord: 'لا يوجد سجل بعد',
  deliverByOn: 'التسليم بحلول {date}',
  requestLabel: 'طلب',
  budget: 'الميزانية',
  due: 'الموعد',
  offersLabel: 'العروض',
  moneyLabel: 'الأموال',
  moneyHeld: 'تُحجز قبل بدء العمل',
  activateLink: 'فعّله الآن',
  errors: {
    ownRequest: 'هذا طلبك أنت.',
    closed: 'هذا الطلب مغلق.',
    price: 'أدخل سعرًا بعملة USDC.',
    priceHigh: 'هذا السعر أعلى بكثير من الميزانية.',
    datePast: 'اختر تاريخًا في المستقبل.',
    dateLate: 'اختر تاريخًا أقرب إلى موعد الطلب.',
    noteLong: 'اجعل الملاحظة أقل من 280 حرفًا.',
    activate: 'فعّل وكيل البيع لتقديم العروض.',
    lapsed: 'انتهت صلاحية هذا العرض.',
    topUp: 'اشحن رصيدك لقبول هذا العرض.',
    alreadyBidding: 'وكيلك يقدّم عرضًا على هذا الطلب بالفعل.',
    busy: 'هناك خطوة أخرى جارية على هذا الطلب. حاول بعد لحظة.',
    matched: 'هذا الطلب لديه عرض مقبول بالفعل.',
    generic: 'لم تنجح العملية. حاول مرة أخرى.',
  },
};

const fr: OffersCopy = {
  makeOffer: 'Faire une offre',
  sheetTitle: 'Votre offre',
  price: 'Prix',
  deliverBy: 'Livraison avant le',
  note: "Note pour l'acheteur",
  notePlaceholder: 'Ce que vous livrez et quand',
  noteCount: '{n} sur 280',
  explainer: "L'acheteur voit votre historique à côté de votre offre. S'il accepte, l'argent est bloqué avant que vous commenciez.",
  send: "Envoyer l'offre",
  sending: 'Envoi',
  sent: 'Offre envoyée',
  sentDetail: '{price} USDC · livraison avant le {date}',
  withdraw: "Retirer l'offre",
  signIn: 'Connectez-vous pour faire une offre',
  countNone: "Pas encore d'offre",
  countOne: '1 offre',
  countMany: '{n} offres',
  listTitle: '{n} offres',
  closestMatch: 'La plus proche de votre demande',
  agentLine: 'Triées par prix. Vous décidez.',
  accept: 'Accepter {seller} · {price} USDC',
  acceptShort: 'Accepter',
  confirmTitle: 'Accepter cette offre',
  confirmBody: "{price} USDC sont bloqués jusqu'à ce que vous approuviez le travail.",
  aboveBudget: '{diff} USDC au-dessus de votre budget',
  includesFee: 'Offre de {price} USDC plus les frais',
  topUpCta: 'Ajouter {amount} USDC',
  cancel: 'Annuler',
  accepted: "Offre acceptée. L'argent est bloqué.",
  noRecord: "Pas encore d'historique",
  deliverByOn: 'Livraison avant le {date}',
  requestLabel: 'Demande',
  budget: 'Budget',
  due: 'Échéance',
  offersLabel: 'Offres',
  moneyLabel: 'Argent',
  moneyHeld: 'Bloqué avant le début du travail',
  activateLink: 'Le configurer',
  errors: {
    ownRequest: "C'est votre propre demande.",
    closed: 'Cette demande est fermée.',
    price: 'Saisissez un prix en USDC.',
    priceHigh: 'Ce prix dépasse largement le budget.',
    datePast: 'Choisissez une date future.',
    dateLate: "Choisissez une date plus proche de l'échéance.",
    noteLong: 'La note doit faire moins de 280 caractères.',
    activate: 'Configurez votre agent vendeur pour faire des offres.',
    lapsed: 'Cette offre a expiré.',
    topUp: 'Rechargez pour accepter cette offre.',
    alreadyBidding: 'Votre agent fait déjà une offre sur cette demande.',
    busy: 'Une autre étape est en cours sur cette demande. Réessayez dans un instant.',
    matched: 'Cette demande a déjà une offre acceptée.',
    generic: "Cela n'a pas fonctionné. Réessayez.",
  },
};

const hi: OffersCopy = {
  makeOffer: 'ऑफ़र दें',
  sheetTitle: 'आपका ऑफ़र',
  price: 'कीमत',
  deliverBy: 'डिलीवरी की तारीख',
  note: 'खरीदार के लिए नोट',
  notePlaceholder: 'आप क्या और कब देंगे',
  noteCount: '280 में से {n}',
  explainer: 'खरीदार आपके ऑफ़र के साथ आपका रिकॉर्ड देखता है। अगर वे स्वीकार करते हैं, तो काम शुरू होने से पहले पैसा रोक लिया जाता है।',
  send: 'ऑफ़र भेजें',
  sending: 'भेजा जा रहा है',
  sent: 'ऑफ़र भेजा गया',
  sentDetail: '{price} USDC · डिलीवरी {date} तक',
  withdraw: 'ऑफ़र वापस लें',
  signIn: 'ऑफ़र देने के लिए साइन इन करें',
  countNone: 'अभी कोई ऑफ़र नहीं',
  countOne: '1 ऑफ़र',
  countMany: '{n} ऑफ़र',
  listTitle: '{n} ऑफ़र',
  closestMatch: 'आपके अनुरोध से सबसे मेल खाता',
  agentLine: 'कीमत के क्रम में। फ़ैसला आपका है।',
  accept: '{seller} स्वीकार करें · {price} USDC',
  acceptShort: 'स्वीकार करें',
  confirmTitle: 'यह ऑफ़र स्वीकार करें',
  confirmBody: 'काम को मंज़ूरी देने तक {price} USDC रोककर रखा जाता है।',
  aboveBudget: 'आपके बजट से {diff} USDC ज़्यादा',
  includesFee: '{price} USDC का ऑफ़र और शुल्क',
  topUpCta: '{amount} USDC टॉप अप करें',
  cancel: 'रद्द करें',
  accepted: 'ऑफ़र स्वीकार हुआ। पैसा रोक लिया गया है।',
  noRecord: 'अभी कोई रिकॉर्ड नहीं',
  deliverByOn: 'डिलीवरी {date} तक',
  requestLabel: 'अनुरोध',
  budget: 'बजट',
  due: 'समय सीमा',
  offersLabel: 'ऑफ़र',
  moneyLabel: 'पैसा',
  moneyHeld: 'काम शुरू होने से पहले रोका जाता है',
  activateLink: 'सेट करें',
  errors: {
    ownRequest: 'यह आपका अपना अनुरोध है।',
    closed: 'यह अनुरोध बंद है।',
    price: 'USDC में कीमत डालें।',
    priceHigh: 'यह कीमत बजट से बहुत ज़्यादा है।',
    datePast: 'आगे की कोई तारीख चुनें।',
    dateLate: 'अनुरोध की समय सीमा के पास की तारीख चुनें।',
    noteLong: 'नोट 280 अक्षरों से कम रखें।',
    activate: 'ऑफ़र देने के लिए अपना विक्रेता एजेंट सेट करें।',
    lapsed: 'यह ऑफ़र समाप्त हो गया है।',
    topUp: 'यह ऑफ़र स्वीकार करने के लिए टॉप अप करें।',
    alreadyBidding: 'आपका एजेंट पहले से इस अनुरोध पर बोली लगा रहा है।',
    busy: 'इस अनुरोध पर एक और कदम चल रहा है। थोड़ी देर में फिर कोशिश करें।',
    matched: 'इस अनुरोध पर पहले से एक ऑफ़र स्वीकार हो चुका है।',
    generic: 'यह नहीं हो पाया। फिर से कोशिश करें।',
  },
};

const sw: OffersCopy = {
  makeOffer: 'Toa ofa',
  sheetTitle: 'Ofa yako',
  price: 'Bei',
  deliverBy: 'Kuwasilisha kabla ya',
  note: 'Ujumbe kwa mnunuzi',
  notePlaceholder: 'Utakachowasilisha na lini',
  noteCount: '{n} kati ya 280',
  explainer: 'Mnunuzi anaona rekodi yako karibu na ofa yako. Akikubali, pesa inashikiliwa kabla hujaanza.',
  send: 'Tuma ofa',
  sending: 'Inatuma',
  sent: 'Ofa imetumwa',
  sentDetail: '{price} USDC · kuwasilisha kabla ya {date}',
  withdraw: 'Ondoa ofa',
  signIn: 'Ingia ili utoe ofa',
  countNone: 'Hakuna ofa bado',
  countOne: 'Ofa 1',
  countMany: 'Ofa {n}',
  listTitle: 'Ofa {n}',
  closestMatch: 'Inayolingana zaidi na ombi lako',
  agentLine: 'Zimepangwa kwa bei. Wewe unaamua.',
  accept: 'Kubali {seller} · {price} USDC',
  acceptShort: 'Kubali',
  confirmTitle: 'Kubali ofa hii',
  confirmBody: '{price} USDC inashikiliwa hadi uidhinishe kazi.',
  aboveBudget: '{diff} USDC juu ya bajeti yako',
  includesFee: 'Ofa ya {price} USDC pamoja na ada',
  topUpCta: 'Ongeza {amount} USDC',
  cancel: 'Ghairi',
  accepted: 'Ofa imekubaliwa. Pesa inashikiliwa.',
  noRecord: 'Hakuna rekodi bado',
  deliverByOn: 'Kuwasilisha kabla ya {date}',
  requestLabel: 'Ombi',
  budget: 'Bajeti',
  due: 'Mwisho',
  offersLabel: 'Ofa',
  moneyLabel: 'Pesa',
  moneyHeld: 'Inashikiliwa kabla kazi haijaanza',
  activateLink: 'Iweke sasa',
  errors: {
    ownRequest: 'Hili ni ombi lako mwenyewe.',
    closed: 'Ombi hili limefungwa.',
    price: 'Weka bei kwa USDC.',
    priceHigh: 'Bei hiyo iko juu sana ya bajeti.',
    datePast: 'Chagua tarehe ijayo.',
    dateLate: 'Chagua tarehe iliyo karibu na mwisho wa ombi.',
    noteLong: 'Ujumbe usizidi herufi 280.',
    activate: 'Weka wakala wako wa kuuza ili utoe ofa.',
    lapsed: 'Ofa hii imeisha muda wake.',
    topUp: 'Ongeza salio ili ukubali ofa hii.',
    alreadyBidding: 'Wakala wako tayari anatoa ofa kwenye ombi hili.',
    busy: 'Hatua nyingine inaendelea kwenye ombi hili. Jaribu tena baada ya muda mfupi.',
    matched: 'Ombi hili tayari lina ofa iliyokubaliwa.',
    generic: 'Haikufanikiwa. Jaribu tena.',
  },
};

export const offersCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', OffersCopy> = { en, ar, fr, hi, sw };
