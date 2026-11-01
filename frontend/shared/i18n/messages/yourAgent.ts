/// The Your agent page (docs/architecture/45-your-agent.md): five plain
/// questions, each with a panel that changes it in place.
export interface YourAgentCopy {
  on: string;
  /// {n} is how many of the agent's offers wait on buyers.
  offersWaiting: string;
  oneOfferWaiting: string;
  off: string;
  offBody: string;
  turnOn: string;
  priceNotice: string;
  setPrice: string;
  rows: { sell: string; price: string; paid: string; alone: string; buy: string };
  notSet: string;
  /// {usual} and {lowest} are USDC amounts.
  priceLine: string;
  priceNotGiven: string;
  kinds: Record<'one_time' | 'milestones' | 'goods', string>;
  kindNotes: Record<'one_time' | 'milestones' | 'goods', string>;
  otherKind: string;
  /// {kind} is one of kinds; {days} a days line.
  paidLine: string;
  daysOne: string;
  daysRange: string;
  /// {max} is a USDC amount, {days} a number of days.
  buyLine: string;
  moreWays: string;
  assistant: string;
  askAssistant: string;
  change: string;
  save: string;
  saving: string;
  cancel: string;
  failed: string;
  fields: {
    skills: string;
    skillsHint: string;
    description: string;
    usual: string;
    lowest: string;
    lowestNote: string;
    daysMin: string;
    daysMax: string;
    what: string;
    shipsTo: string;
    maxPrice: string;
    waitDays: string;
  };
  problems: { missing: string; order: string; daysOrder: string };
  recordSources: string;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const yourAgentCopy: Record<Locale, YourAgentCopy> = {
  en: {
    on: 'On',
    offersWaiting: '{n} offers waiting on buyers',
    oneOfferWaiting: '1 offer waiting on a buyer',
    off: 'Your agent is off',
    offBody: 'Turn it on to offer on requests that fit what you sell.',
    turnOn: 'Turn on your agent',
    priceNotice: "Set your usual price. Until you do, your agent offers at the buyer's budget.",
    setPrice: 'Set price',
    rows: { sell: 'What you sell', price: 'Your price', paid: 'How you get paid', alone: 'What it does alone', buy: 'When you buy' },
    notSet: 'Not set',
    priceLine: 'Usually {usual} USDC, lowest {lowest}',
    priceNotGiven: 'Not given yet',
    kinds: { one_time: 'All at once', milestones: 'In stages', goods: 'On delivery' },
    kindNotes: { one_time: 'One payment when the work is done', milestones: 'Paid stage by stage as you deliver', goods: 'For goods, paid when they arrive' },
    otherKind: 'Another way, see More ways to get paid',
    paidLine: '{kind}, {days}',
    daysOne: 'done in {n} days',
    daysRange: 'done in {min} to {max} days',
    buyLine: 'Up to {max} USDC, within {days} days',
    moreWays: 'More ways to get paid',
    assistant: 'Or tell your assistant, such as "make my usual price 60".',
    askAssistant: 'Ask your assistant',
    change: 'Change',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    failed: "That didn't save. Try again.",
    fields: {
      skills: 'What you sell',
      skillsHint: 'Separate with commas',
      description: 'Describe what you offer',
      usual: 'Your usual price, USDC',
      lowest: 'The lowest you take, USDC',
      lowestNote: 'Under this your agent still offers, at this price.',
      daysMin: 'Fastest, in days',
      daysMax: 'Longest, in days',
      what: 'What you ship',
      shipsTo: 'Where you ship to',
      maxPrice: 'Most you pay without being asked, USDC',
      waitDays: 'How long you can wait, in days',
    },
    problems: { missing: 'Fill in every box.', order: "The lowest can't be above the usual price.", daysOrder: "The fastest can't be longer than the longest." },
    recordSources: 'Where your record comes from',
  },
  fr: {
    on: 'Activé',
    offersWaiting: '{n} offres en attente d’acheteurs',
    oneOfferWaiting: '1 offre en attente d’un acheteur',
    off: 'Votre agent est désactivé',
    offBody: 'Activez-le pour faire des offres sur les demandes qui correspondent à ce que vous vendez.',
    turnOn: 'Activer votre agent',
    priceNotice: 'Indiquez votre prix habituel. D’ici là, votre agent propose le budget de l’acheteur.',
    setPrice: 'Indiquer le prix',
    rows: { sell: 'Ce que vous vendez', price: 'Votre prix', paid: 'Comment vous êtes payé', alone: 'Ce qu’il fait seul', buy: 'Quand vous achetez' },
    notSet: 'Non défini',
    priceLine: 'Habituellement {usual} USDC, minimum {lowest}',
    priceNotGiven: 'Pas encore indiqué',
    kinds: { one_time: 'En une fois', milestones: 'Par étapes', goods: 'À la livraison' },
    kindNotes: { one_time: 'Un paiement quand le travail est fait', milestones: 'Payé étape par étape au fil des livraisons', goods: 'Pour des biens, payé à leur arrivée' },
    otherKind: 'Une autre façon, voir Autres façons d’être payé',
    paidLine: '{kind}, {days}',
    daysOne: 'fait en {n} jours',
    daysRange: 'fait en {min} à {max} jours',
    buyLine: 'Jusqu’à {max} USDC, sous {days} jours',
    moreWays: 'Autres façons d’être payé',
    assistant: 'Ou dites-le à votre assistant, par exemple « mets mon prix habituel à 60 ».',
    askAssistant: 'Demander à votre assistant',
    change: 'Modifier',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    cancel: 'Annuler',
    failed: 'Ce n’est pas enregistré. Réessayez.',
    fields: {
      skills: 'Ce que vous vendez',
      skillsHint: 'Séparez par des virgules',
      description: 'Décrivez ce que vous proposez',
      usual: 'Votre prix habituel, USDC',
      lowest: 'Le minimum que vous acceptez, USDC',
      lowestNote: 'En dessous, votre agent propose quand même, à ce prix.',
      daysMin: 'Au plus vite, en jours',
      daysMax: 'Au plus long, en jours',
      what: 'Ce que vous expédiez',
      shipsTo: 'Où vous expédiez',
      maxPrice: 'Le maximum que vous payez sans qu’on vous demande, USDC',
      waitDays: 'Combien de temps vous pouvez attendre, en jours',
    },
    problems: { missing: 'Remplissez chaque case.', order: 'Le minimum ne peut pas dépasser le prix habituel.', daysOrder: 'Le plus rapide ne peut pas dépasser le plus long.' },
    recordSources: 'D’où vient votre dossier',
  },
  ar: {
    on: 'مفعّل',
    offersWaiting: '{n} عروض بانتظار المشترين',
    oneOfferWaiting: 'عرض واحد بانتظار مشترٍ',
    off: 'وكيلك متوقف',
    offBody: 'فعّله ليقدّم عروضًا على الطلبات التي تناسب ما تبيعه.',
    turnOn: 'فعّل وكيلك',
    priceNotice: 'حدّد سعرك المعتاد. حتى تفعل ذلك، يعرض وكيلك ميزانية المشتري.',
    setPrice: 'حدّد السعر',
    rows: { sell: 'ما تبيعه', price: 'سعرك', paid: 'كيف تتقاضى أجرك', alone: 'ما يفعله وحده', buy: 'عندما تشتري' },
    notSet: 'غير محدد',
    priceLine: 'عادةً {usual} USDC، والأدنى {lowest}',
    priceNotGiven: 'لم يُحدَّد بعد',
    kinds: { one_time: 'دفعة واحدة', milestones: 'على مراحل', goods: 'عند التسليم' },
    kindNotes: { one_time: 'دفعة واحدة عند إنجاز العمل', milestones: 'يُدفع مرحلة بمرحلة مع كل تسليم', goods: 'للسلع، يُدفع عند وصولها' },
    otherKind: 'طريقة أخرى، انظر طرقًا أخرى للدفع',
    paidLine: '{kind}، {days}',
    daysOne: 'يُنجز في {n} أيام',
    daysRange: 'يُنجز في {min} إلى {max} أيام',
    buyLine: 'حتى {max} USDC، خلال {days} أيام',
    moreWays: 'طرق أخرى للدفع',
    assistant: 'أو أخبر مساعدك، مثل «اجعل سعري المعتاد 60».',
    askAssistant: 'اسأل مساعدك',
    change: 'تغيير',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    cancel: 'إلغاء',
    failed: 'لم يُحفظ. حاول مرة أخرى.',
    fields: {
      skills: 'ما تبيعه',
      skillsHint: 'افصل بفواصل',
      description: 'صف ما تقدّمه',
      usual: 'سعرك المعتاد، USDC',
      lowest: 'أدنى سعر تقبله، USDC',
      lowestNote: 'تحت هذا السعر يعرض وكيلك مع ذلك، بهذا السعر.',
      daysMin: 'الأسرع، بالأيام',
      daysMax: 'الأطول، بالأيام',
      what: 'ما تشحنه',
      shipsTo: 'إلى أين تشحن',
      maxPrice: 'أقصى ما تدفعه دون أن يُطلب منك، USDC',
      waitDays: 'كم يمكنك الانتظار، بالأيام',
    },
    problems: { missing: 'املأ كل الخانات.', order: 'لا يمكن أن يتجاوز الأدنى السعر المعتاد.', daysOrder: 'لا يمكن أن يكون الأسرع أطول من الأطول.' },
    recordSources: 'من أين يأتي سجلك',
  },
  hi: {
    on: 'चालू',
    offersWaiting: '{n} ऑफ़र खरीदारों के इंतज़ार में',
    oneOfferWaiting: '1 ऑफ़र एक खरीदार के इंतज़ार में',
    off: 'आपका एजेंट बंद है',
    offBody: 'इसे चालू करें ताकि यह आपके बेचे जाने वाले काम से मेल खाते अनुरोधों पर ऑफ़र दे।',
    turnOn: 'अपना एजेंट चालू करें',
    priceNotice: 'अपनी सामान्य कीमत बताएं। तब तक आपका एजेंट खरीदार के बजट पर ऑफ़र देता है।',
    setPrice: 'कीमत बताएं',
    rows: { sell: 'आप क्या बेचते हैं', price: 'आपकी कीमत', paid: 'आपको भुगतान कैसे मिलता है', alone: 'यह खुद क्या करता है', buy: 'जब आप खरीदते हैं' },
    notSet: 'तय नहीं',
    priceLine: 'आमतौर पर {usual} USDC, सबसे कम {lowest}',
    priceNotGiven: 'अभी नहीं बताई',
    kinds: { one_time: 'एक बार में', milestones: 'चरणों में', goods: 'डिलीवरी पर' },
    kindNotes: { one_time: 'काम पूरा होने पर एक भुगतान', milestones: 'हर चरण की डिलीवरी पर भुगतान', goods: 'सामान के लिए, पहुंचने पर भुगतान' },
    otherKind: 'कोई और तरीका, भुगतान के और तरीके देखें',
    paidLine: '{kind}, {days}',
    daysOne: '{n} दिनों में पूरा',
    daysRange: '{min} से {max} दिनों में पूरा',
    buyLine: '{max} USDC तक, {days} दिनों के भीतर',
    moreWays: 'भुगतान के और तरीके',
    assistant: 'या अपने असिस्टेंट से कहें, जैसे "मेरी सामान्य कीमत 60 कर दो"।',
    askAssistant: 'अपने असिस्टेंट से पूछें',
    change: 'बदलें',
    save: 'सहेजें',
    saving: 'सहेजा जा रहा है…',
    cancel: 'रद्द करें',
    failed: 'यह सहेजा नहीं गया। फिर कोशिश करें।',
    fields: {
      skills: 'आप क्या बेचते हैं',
      skillsHint: 'कॉमा से अलग करें',
      description: 'बताएं कि आप क्या देते हैं',
      usual: 'आपकी सामान्य कीमत, USDC',
      lowest: 'सबसे कम जो आप लेते हैं, USDC',
      lowestNote: 'इससे कम पर भी आपका एजेंट इसी कीमत पर ऑफ़र देता है।',
      daysMin: 'सबसे जल्दी, दिनों में',
      daysMax: 'सबसे देर, दिनों में',
      what: 'आप क्या भेजते हैं',
      shipsTo: 'आप कहां भेजते हैं',
      maxPrice: 'बिना पूछे आप ज़्यादा से ज़्यादा कितना देते हैं, USDC',
      waitDays: 'आप कितने दिन इंतज़ार कर सकते हैं',
    },
    problems: { missing: 'हर खाना भरें।', order: 'सबसे कम कीमत सामान्य कीमत से ज़्यादा नहीं हो सकती।', daysOrder: 'सबसे जल्दी, सबसे देर से लंबा नहीं हो सकता।' },
    recordSources: 'आपका रिकॉर्ड कहां से आता है',
  },
  sw: {
    on: 'Imewashwa',
    offersWaiting: 'Ofa {n} zinasubiri wanunuzi',
    oneOfferWaiting: 'Ofa 1 inasubiri mnunuzi',
    off: 'Wakala wako amezimwa',
    offBody: 'Mwashe ili atoe ofa kwa maombi yanayolingana na unachouza.',
    turnOn: 'Washa wakala wako',
    priceNotice: 'Weka bei yako ya kawaida. Hadi utakapoiweka, wakala wako hutoa ofa kwa bajeti ya mnunuzi.',
    setPrice: 'Weka bei',
    rows: { sell: 'Unachouza', price: 'Bei yako', paid: 'Unavyolipwa', alone: 'Anachofanya peke yake', buy: 'Unaponunua' },
    notSet: 'Haijawekwa',
    priceLine: 'Kwa kawaida {usual} USDC, chini kabisa {lowest}',
    priceNotGiven: 'Bado haijawekwa',
    kinds: { one_time: 'Mara moja', milestones: 'Kwa hatua', goods: 'Wakati wa kufikishwa' },
    kindNotes: { one_time: 'Malipo moja kazi ikikamilika', milestones: 'Unalipwa hatua kwa hatua unapowasilisha', goods: 'Kwa bidhaa, malipo zikifika' },
    otherKind: 'Njia nyingine, ona Njia zaidi za kulipwa',
    paidLine: '{kind}, {days}',
    daysOne: 'inakamilika kwa siku {n}',
    daysRange: 'inakamilika kwa siku {min} hadi {max}',
    buyLine: 'Hadi USDC {max}, ndani ya siku {days}',
    moreWays: 'Njia zaidi za kulipwa',
    assistant: 'Au mwambie msaidizi wako, kama "weka bei yangu ya kawaida 60".',
    askAssistant: 'Muulize msaidizi wako',
    change: 'Badilisha',
    save: 'Hifadhi',
    saving: 'Inahifadhi…',
    cancel: 'Ghairi',
    failed: 'Haikuhifadhiwa. Jaribu tena.',
    fields: {
      skills: 'Unachouza',
      skillsHint: 'Tenganisha kwa koma',
      description: 'Eleza unachotoa',
      usual: 'Bei yako ya kawaida, USDC',
      lowest: 'Bei ya chini kabisa unayokubali, USDC',
      lowestNote: 'Chini ya hapa wakala wako bado hutoa ofa, kwa bei hii.',
      daysMin: 'Haraka zaidi, kwa siku',
      daysMax: 'Muda mrefu zaidi, kwa siku',
      what: 'Unachotuma',
      shipsTo: 'Unakotuma',
      maxPrice: 'Kiasi cha juu unacholipa bila kuulizwa, USDC',
      waitDays: 'Unaweza kusubiri siku ngapi',
    },
    problems: { missing: 'Jaza kila kisanduku.', order: 'Bei ya chini haiwezi kuzidi bei ya kawaida.', daysOrder: 'Haraka zaidi haiwezi kuzidi muda mrefu zaidi.' },
    recordSources: 'Rekodi yako inatoka wapi',
  },
};
