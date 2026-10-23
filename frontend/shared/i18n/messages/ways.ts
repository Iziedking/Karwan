/// How a person deals (docs/architecture/26-agents-for-every-deal.md): the
/// Your agents rows on Profile and the /profile/ways page.
export interface WaysCopy {
  title: string;
  hint: string;
  selling: string;
  buying: string;
  shapes: Record<'one_time' | 'milestones' | 'goods' | 'deposit', string>;
  sellNotes: Record<'one_time' | 'milestones' | 'goods' | 'deposit', string>;
  buyNotes: Record<'one_time' | 'milestones' | 'goods' | 'deposit', string>;
  add: string;
  edit: string;
  remove: string;
  done: string;
  cancel: string;
  save: string;
  saving: string;
  saved: string;
  failed: string;
  none: string;
  missing: string;
  order: string;
  fields: {
    priceFrom: string;
    priceTo: string;
    daysFrom: string;
    daysTo: string;
    stages: string;
    whatSell: string;
    whatRent: string;
    shipsTo: string;
    arrives: string;
    deposit: string;
    period: string;
    maxPrice: string;
    needDays: string;
    pay: string;
    deliverTo: string;
    waitDays: string;
    maxDeposit: string;
  };
  unitDays: string;
  payEnd: string;
  payStages: string;
  usdc: string;
  usdcRange: string;
  days: string;
  daysRange: string;
  upTo: string;
  within: string;
  stagesLine: string;
  shipsToLine: string;
  deliverToLine: string;
  depositLine: string;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const waysCopy: Record<Locale, WaysCopy> = {
  en: {
    title: 'How you deal',
    hint: 'Your agents offer and ask only in these ways. Money never moves without your confirmation.',
    selling: 'Selling',
    buying: 'Buying',
    shapes: { one_time: 'One-time', milestones: 'Milestones', goods: 'Goods with delivery', deposit: 'Refundable deposit' },
    sellNotes: {
      one_time: 'Paid once, when the work is done',
      milestones: 'Paid in stages, each after you deliver it',
      goods: 'Paid when the buyer has the item',
      deposit: 'Held while they use it, then returned',
    },
    buyNotes: {
      one_time: 'You pay once, when you have the work',
      milestones: 'You pay part as each stage arrives',
      goods: 'You pay once the item reaches you',
      deposit: 'You put down a deposit and get it back',
    },
    add: 'Add a way',
    edit: 'Edit',
    remove: 'Remove',
    done: 'Done',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved. Your agents now deal this way.',
    failed: 'Could not save. Try again.',
    none: 'No ways yet.',
    missing: 'Fill in every field.',
    order: 'The lowest cannot be above the highest.',
    fields: {
      priceFrom: 'Price from', priceTo: 'Price up to', daysFrom: 'Done in at least', daysTo: 'Done in at most', stages: 'Stages',
      whatSell: 'What you sell', whatRent: 'What you rent out', shipsTo: 'Ships to', arrives: 'Arrives in',
      deposit: 'Deposit', period: 'For how long', maxPrice: 'Most you pay', needDays: 'Needed within', pay: 'How you pay',
      deliverTo: 'Delivered to', waitDays: 'You can wait', maxDeposit: 'Most deposit you put down',
    },
    unitDays: 'days',
    payEnd: 'At the end',
    payStages: 'Stage by stage',
    usdc: '{n} USDC',
    usdcRange: '{min} to {max} USDC',
    days: '{n} days',
    daysRange: '{min} to {max} days',
    upTo: 'Up to {n} USDC',
    within: 'within {n} days',
    stagesLine: '{n} stages',
    shipsToLine: 'to {place}',
    deliverToLine: 'to {place}',
    depositLine: '{n} USDC deposit',
  },
  fr: {
    title: 'Comment vous traitez',
    hint: 'Vos agents proposent et demandent seulement de ces façons. L’argent ne bouge jamais sans votre confirmation.',
    selling: 'Vente',
    buying: 'Achat',
    shapes: { one_time: 'En une fois', milestones: 'Par étapes', goods: 'Marchandises livrées', deposit: 'Caution remboursable' },
    sellNotes: {
      one_time: 'Payé une fois, quand le travail est fait',
      milestones: 'Payé par étapes, chacune après livraison',
      goods: 'Payé quand l’acheteur a l’article',
      deposit: 'Retenue pendant l’usage, puis rendue',
    },
    buyNotes: {
      one_time: 'Vous payez une fois, quand vous avez le travail',
      milestones: 'Vous payez une part à chaque étape reçue',
      goods: 'Vous payez quand l’article vous arrive',
      deposit: 'Vous versez une caution et la récupérez',
    },
    add: 'Ajouter une façon',
    edit: 'Modifier',
    remove: 'Retirer',
    done: 'Terminé',
    cancel: 'Annuler',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Enregistré. Vos agents traitent désormais ainsi.',
    failed: 'Impossible d’enregistrer. Réessayez.',
    none: 'Aucune façon pour le moment.',
    missing: 'Remplissez chaque champ.',
    order: 'Le minimum ne peut pas dépasser le maximum.',
    fields: {
      priceFrom: 'Prix à partir de', priceTo: 'Prix jusqu’à', daysFrom: 'Fait en au moins', daysTo: 'Fait en au plus', stages: 'Étapes',
      whatSell: 'Ce que vous vendez', whatRent: 'Ce que vous louez', shipsTo: 'Livre vers', arrives: 'Arrive en',
      deposit: 'Caution', period: 'Pour combien de temps', maxPrice: 'Le plus que vous payez', needDays: 'Nécessaire sous', pay: 'Comment vous payez',
      deliverTo: 'Livré à', waitDays: 'Vous pouvez attendre', maxDeposit: 'Caution maximale versée',
    },
    unitDays: 'jours',
    payEnd: 'À la fin',
    payStages: 'Étape par étape',
    usdc: '{n} USDC',
    usdcRange: '{min} à {max} USDC',
    days: '{n} jours',
    daysRange: '{min} à {max} jours',
    upTo: 'Jusqu’à {n} USDC',
    within: 'sous {n} jours',
    stagesLine: '{n} étapes',
    shipsToLine: 'vers {place}',
    deliverToLine: 'à {place}',
    depositLine: 'caution de {n} USDC',
  },
  ar: {
    title: 'طريقة تعاملك',
    hint: 'وكلاؤك يعرضون ويطلبون بهذه الطرق فقط. المال لا يتحرك أبدًا دون تأكيدك.',
    selling: 'البيع',
    buying: 'الشراء',
    shapes: { one_time: 'دفعة واحدة', milestones: 'على مراحل', goods: 'بضائع مع التوصيل', deposit: 'تأمين مسترد' },
    sellNotes: {
      one_time: 'يُدفع مرة واحدة عند إنجاز العمل',
      milestones: 'يُدفع على مراحل، كل مرحلة بعد تسليمها',
      goods: 'يُدفع حين يستلم المشتري السلعة',
      deposit: 'يُحجز أثناء الاستخدام ثم يُعاد',
    },
    buyNotes: {
      one_time: 'تدفع مرة واحدة عند استلام العمل',
      milestones: 'تدفع جزءًا مع وصول كل مرحلة',
      goods: 'تدفع حين تصلك السلعة',
      deposit: 'تضع تأمينًا ويُعاد إليك',
    },
    add: 'أضف طريقة',
    edit: 'تعديل',
    remove: 'إزالة',
    done: 'تم',
    cancel: 'إلغاء',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    saved: 'تم الحفظ. وكلاؤك يتعاملون بهذه الطريقة الآن.',
    failed: 'تعذّر الحفظ. حاول مرة أخرى.',
    none: 'لا توجد طرق بعد.',
    missing: 'املأ كل الحقول.',
    order: 'لا يمكن أن يكون الأدنى أعلى من الأقصى.',
    fields: {
      priceFrom: 'السعر من', priceTo: 'السعر حتى', daysFrom: 'يُنجز في الأقل خلال', daysTo: 'يُنجز في الأكثر خلال', stages: 'المراحل',
      whatSell: 'ما تبيعه', whatRent: 'ما تؤجره', shipsTo: 'يُشحن إلى', arrives: 'يصل خلال',
      deposit: 'التأمين', period: 'لأي مدة', maxPrice: 'أقصى ما تدفعه', needDays: 'مطلوب خلال', pay: 'طريقة الدفع',
      deliverTo: 'يُسلَّم إلى', waitDays: 'يمكنك الانتظار', maxDeposit: 'أقصى تأمين تضعه',
    },
    unitDays: 'أيام',
    payEnd: 'في النهاية',
    payStages: 'مرحلة بمرحلة',
    usdc: '{n} USDC',
    usdcRange: 'من {min} إلى {max} USDC',
    days: '{n} أيام',
    daysRange: 'من {min} إلى {max} أيام',
    upTo: 'حتى {n} USDC',
    within: 'خلال {n} أيام',
    stagesLine: '{n} مراحل',
    shipsToLine: 'إلى {place}',
    deliverToLine: 'إلى {place}',
    depositLine: 'تأمين {n} USDC',
  },
  hi: {
    title: 'आप कैसे सौदा करते हैं',
    hint: 'आपके एजेंट केवल इन्हीं तरीकों से ऑफ़र और अनुरोध करते हैं। आपकी पुष्टि के बिना पैसा कभी नहीं हिलता।',
    selling: 'बेचना',
    buying: 'खरीदना',
    shapes: { one_time: 'एक बार में', milestones: 'चरणों में', goods: 'डिलीवरी वाला सामान', deposit: 'वापसी योग्य जमा' },
    sellNotes: {
      one_time: 'काम पूरा होने पर एक बार भुगतान',
      milestones: 'चरणों में भुगतान, हर चरण डिलीवर होने के बाद',
      goods: 'खरीदार के पास सामान पहुँचने पर भुगतान',
      deposit: 'इस्तेमाल के दौरान रोका, फिर लौटाया',
    },
    buyNotes: {
      one_time: 'काम मिलने पर आप एक बार भुगतान करते हैं',
      milestones: 'हर चरण आने पर आप एक हिस्सा देते हैं',
      goods: 'सामान आप तक पहुँचने पर आप भुगतान करते हैं',
      deposit: 'आप जमा रखते हैं और वह वापस मिलता है',
    },
    add: 'तरीका जोड़ें',
    edit: 'बदलें',
    remove: 'हटाएँ',
    done: 'हो गया',
    cancel: 'रद्द करें',
    save: 'सहेजें',
    saving: 'सहेजा जा रहा है…',
    saved: 'सहेज लिया। आपके एजेंट अब इसी तरह सौदा करते हैं।',
    failed: 'सहेजा नहीं जा सका। फिर कोशिश करें।',
    none: 'अभी कोई तरीका नहीं।',
    missing: 'हर फ़ील्ड भरें।',
    order: 'न्यूनतम, अधिकतम से ज़्यादा नहीं हो सकता।',
    fields: {
      priceFrom: 'कीमत से', priceTo: 'कीमत तक', daysFrom: 'कम से कम इतने दिन', daysTo: 'ज़्यादा से ज़्यादा इतने दिन', stages: 'चरण',
      whatSell: 'आप क्या बेचते हैं', whatRent: 'आप क्या किराए पर देते हैं', shipsTo: 'कहाँ भेजते हैं', arrives: 'पहुँचने में',
      deposit: 'जमा', period: 'कितने समय के लिए', maxPrice: 'आप अधिकतम कितना देते हैं', needDays: 'कितने दिनों में चाहिए', pay: 'आप कैसे भुगतान करते हैं',
      deliverTo: 'कहाँ पहुँचे', waitDays: 'आप इंतज़ार कर सकते हैं', maxDeposit: 'अधिकतम जमा',
    },
    unitDays: 'दिन',
    payEnd: 'अंत में',
    payStages: 'चरण दर चरण',
    usdc: '{n} USDC',
    usdcRange: '{min} से {max} USDC',
    days: '{n} दिन',
    daysRange: '{min} से {max} दिन',
    upTo: '{n} USDC तक',
    within: '{n} दिनों में',
    stagesLine: '{n} चरण',
    shipsToLine: '{place} तक',
    deliverToLine: '{place} तक',
    depositLine: '{n} USDC जमा',
  },
  sw: {
    title: 'Jinsi unavyofanya biashara',
    hint: 'Mawakala wako hutoa na kuomba kwa njia hizi tu. Pesa haisogei kamwe bila uthibitisho wako.',
    selling: 'Kuuza',
    buying: 'Kununua',
    shapes: { one_time: 'Mara moja', milestones: 'Kwa hatua', goods: 'Bidhaa zinazowasilishwa', deposit: 'Amana inayorudishwa' },
    sellNotes: {
      one_time: 'Hulipwa mara moja kazi ikikamilika',
      milestones: 'Hulipwa kwa hatua, kila moja baada ya kuiwasilisha',
      goods: 'Hulipwa mnunuzi akipata bidhaa',
      deposit: 'Hushikiliwa wakati wa matumizi, kisha hurudishwa',
    },
    buyNotes: {
      one_time: 'Unalipa mara moja ukipata kazi',
      milestones: 'Unalipa sehemu kila hatua ikifika',
      goods: 'Unalipa bidhaa ikikufikia',
      deposit: 'Unaweka amana na inarudishwa',
    },
    add: 'Ongeza njia',
    edit: 'Badilisha',
    remove: 'Ondoa',
    done: 'Imekamilika',
    cancel: 'Ghairi',
    save: 'Hifadhi',
    saving: 'Inahifadhi…',
    saved: 'Imehifadhiwa. Mawakala wako sasa wanafanya biashara hivi.',
    failed: 'Imeshindwa kuhifadhi. Jaribu tena.',
    none: 'Bado hakuna njia.',
    missing: 'Jaza kila sehemu.',
    order: 'Kiwango cha chini hakiwezi kuzidi cha juu.',
    fields: {
      priceFrom: 'Bei kuanzia', priceTo: 'Bei hadi', daysFrom: 'Inakamilika angalau kwa', daysTo: 'Inakamilika zaidi kwa', stages: 'Hatua',
      whatSell: 'Unachouza', whatRent: 'Unachokodisha', shipsTo: 'Inatumwa hadi', arrives: 'Inafika kwa',
      deposit: 'Amana', period: 'Kwa muda gani', maxPrice: 'Kiasi cha juu unacholipa', needDays: 'Inahitajika ndani ya', pay: 'Unavyolipa',
      deliverTo: 'Inawasilishwa hadi', waitDays: 'Unaweza kusubiri', maxDeposit: 'Amana ya juu unayoweka',
    },
    unitDays: 'siku',
    payEnd: 'Mwishoni',
    payStages: 'Hatua kwa hatua',
    usdc: 'USDC {n}',
    usdcRange: 'USDC {min} hadi {max}',
    days: 'Siku {n}',
    daysRange: 'Siku {min} hadi {max}',
    upTo: 'Hadi USDC {n}',
    within: 'ndani ya siku {n}',
    stagesLine: 'Hatua {n}',
    shipsToLine: 'hadi {place}',
    deliverToLine: 'hadi {place}',
    depositLine: 'Amana ya USDC {n}',
  },
};
