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
  /// Be found and be reached (view 72).
  find: {
    beFound: string;
    beFoundBody: string;
    letFind: string;
    reach: string;
    reachBody: string;
    letReach: string;
    off: string;
    /// {ways} is the meet line.
    onWays: string;
    /// {n} is how many needs.
    onNeeds: string;
    onOneNeed: string;
    onNoNeeds: string;
    newTag: string;
    whereYouAre: string;
    whereNotSet: string;
    whereNote: string;
    howMeet: string;
    atPlace: string;
    atPlaceNote: string;
    goTo: string;
    goToNote: string;
    /// {n} is a number of km.
    km: string;
    online: string;
    onlineNote: string;
    /// Short parts of the meet line; {n} is km.
    atPlaceShort: string;
    goToShort: string;
    onlineShort: string;
    meetMissing: string;
    whoAlerts: string;
    anyone: string;
    verified: string;
    needsLabel: string;
    needsNote: string;
    noNeeds: string;
    addNeed: string;
    addNeedTitle: string;
    changeNeedTitle: string;
    addNeedCta: string;
    removeNeed: string;
    pause: string;
    resume: string;
    paused: string;
    needWhat: string;
    howOften: string;
    every: Record<'once' | 'week' | 'month' | 'season', string>;
    budgetEach: string;
    reachesYou: string;
    reaches: Record<'goods' | 'in_person' | 'remote', string>;
    /// {budget} is an amount.
    about: string;
    tooMany: string;
  };
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
    rows: { sell: 'What you sell', price: 'Your price', paid: 'How you get paid', alone: "Agent permissions", buy: 'When you buy' },
    notSet: 'Not set',
    priceLine: 'Usually {usual} USDC, lowest {lowest}',
    priceNotGiven: 'Not given yet',
    kinds: { one_time: "Single payment", milestones: 'In stages', goods: "Goods" },
    kindNotes: { one_time: "One payment under the agreed release rules", milestones: "Payments by milestone under the agreed release rules", goods: "Delivery of goods with agreed review and release rules" },
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
      maxPrice: "Buying budget limit, USDC",
      waitDays: 'How long you can wait, in days',
    },
    problems: { missing: 'Fill in every box.', order: "The lowest can't be above the usual price.", daysOrder: "The fastest can't be longer than the longest." },
    recordSources: 'Where your record comes from',
    find: {
      beFound: "Be found",
      beFoundBody: "Your agent shows you to people who need what you sell, near you or online.",
      letFind: "Let agents find me",
      reach: "Let sellers reach me",
      reachBody: "Sellers near you can offer for what you regularly need. Nothing is paid until you say yes.",
      letReach: "Let sellers reach me",
      off: "Off",
      onWays: "On · {ways}",
      onNeeds: "On · {n} needs",
      onOneNeed: "On · 1 need",
      onNoNeeds: "On · no needs yet",
      newTag: "New",
      whereYouAre: "Where you are",
      whereNotSet: "Not set. Tell your assistant where you are.",
      whereNote: "Used only to work out how far people are. Others see the distance, never where you are.",
      howMeet: "How you meet people",
      atPlace: "At my shop or place",
      atPlaceNote: "People come to you",
      goTo: "I go to them",
      goToNote: "As far as you travel",
      km: "{n} km",
      online: "Online",
      onlineNote: "Work done and sent online",
      atPlaceShort: "at your shop",
      goToShort: "you go to people up to {n} km away",
      onlineShort: "online",
      meetMissing: "Choose at least one way to meet people.",
      whoAlerts: "Who can send you deal alerts",
      anyone: "Anyone on Karwan",
      verified: "Verified people only",
      needsLabel: "What you regularly need",
      needsNote: "Sellers who fit can offer for these while Let sellers reach me is on. Pause one to stop offers on it.",
      noNeeds: "Nothing yet.",
      addNeed: "Add a need",
      addNeedTitle: "Add a need",
      changeNeedTitle: "Change this need",
      addNeedCta: "Add need",
      removeNeed: "Remove",
      pause: "Pause",
      resume: "Resume",
      paused: "Paused",
      needWhat: "What you need",
      howOften: "How often",
      every: {
        once: "Once",
        week: "Every week",
        month: "Every month",
        season: "Each season"
      },
      budgetEach: "Rough budget each time",
      reachesYou: "How it reaches you",
      reaches: {
        goods: "Delivered",
        in_person: "At my place",
        remote: "Online"
      },
      about: "about {budget}",
      tooMany: "You can keep up to 10 needs. Remove one first."
    },
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
    rows: { sell: 'Ce que vous vendez', price: 'Votre prix', paid: 'Comment vous êtes payé', alone: "Autorisations de l’agent", buy: 'Quand vous achetez' },
    notSet: 'Non défini',
    priceLine: 'Habituellement {usual} USDC, minimum {lowest}',
    priceNotGiven: 'Pas encore indiqué',
    kinds: { one_time: "Paiement unique", milestones: 'Par étapes', goods: "Biens" },
    kindNotes: { one_time: "Un paiement selon les règles de libération convenues", milestones: "Paiements par étape selon les règles de libération convenues", goods: "Livraison de biens avec des règles de révision et de libération convenues" },
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
      maxPrice: "Budget d’achat maximal, USDC",
      waitDays: 'Combien de temps vous pouvez attendre, en jours',
    },
    problems: { missing: 'Remplissez chaque case.', order: 'Le minimum ne peut pas dépasser le prix habituel.', daysOrder: 'Le plus rapide ne peut pas dépasser le plus long.' },
    recordSources: 'D’où vient votre dossier',
    find: {
      beFound: "Être trouvé",
      beFoundBody: "Votre agent vous présente aux personnes qui ont besoin de ce que vous vendez, près de chez vous ou en ligne.",
      letFind: "Laisser les agents me trouver",
      reach: "Laisser les vendeurs me joindre",
      reachBody: "Les vendeurs proches peuvent faire une offre pour ce dont vous avez régulièrement besoin. Rien n’est payé avant votre accord.",
      letReach: "Laisser les vendeurs me joindre",
      off: "Désactivé",
      onWays: "Activé · {ways}",
      onNeeds: "Activé · {n} besoins",
      onOneNeed: "Activé · 1 besoin",
      onNoNeeds: "Activé · aucun besoin pour l’instant",
      newTag: "Nouveau",
      whereYouAre: "Où vous êtes",
      whereNotSet: "Non renseigné. Dites à votre assistant où vous êtes.",
      whereNote: "Sert uniquement à calculer la distance. Les autres voient la distance, jamais l’endroit où vous êtes.",
      howMeet: "Comment vous rencontrez les gens",
      atPlace: "À ma boutique ou chez moi",
      atPlaceNote: "Les gens viennent à vous",
      goTo: "Je me déplace",
      goToNote: "Jusqu’où vous allez",
      km: "{n} km",
      online: "En ligne",
      onlineNote: "Travail fait et envoyé en ligne",
      atPlaceShort: "à votre boutique",
      goToShort: "vous vous déplacez jusqu’à {n} km",
      onlineShort: "en ligne",
      meetMissing: "Choisissez au moins une façon de rencontrer les gens.",
      whoAlerts: "Qui peut vous envoyer des alertes",
      anyone: "Tout le monde sur Karwan",
      verified: "Seulement les personnes vérifiées",
      needsLabel: "Ce dont vous avez régulièrement besoin",
      needsNote: "Les vendeurs qui correspondent peuvent faire une offre tant que l’option est activée. Mettez un besoin en pause pour arrêter les offres.",
      noNeeds: "Rien pour l’instant.",
      addNeed: "Ajouter un besoin",
      addNeedTitle: "Ajouter un besoin",
      changeNeedTitle: "Modifier ce besoin",
      addNeedCta: "Ajouter",
      removeNeed: "Retirer",
      pause: "Pause",
      resume: "Reprendre",
      paused: "En pause",
      needWhat: "Ce dont vous avez besoin",
      howOften: "À quelle fréquence",
      every: {
        once: "Une fois",
        week: "Chaque semaine",
        month: "Chaque mois",
        season: "Chaque saison"
      },
      budgetEach: "Budget approximatif à chaque fois",
      reachesYou: "Comment cela vous parvient",
      reaches: {
        goods: "Livré",
        in_person: "Chez moi",
        remote: "En ligne"
      },
      about: "environ {budget}",
      tooMany: "Vous pouvez garder jusqu’à 10 besoins. Retirez-en un d’abord."
    },
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
    rows: { sell: 'ما تبيعه', price: 'سعرك', paid: 'كيف تتقاضى أجرك', alone: "صلاحيات الوكيل", buy: 'عندما تشتري' },
    notSet: 'غير محدد',
    priceLine: 'عادةً {usual} USDC، والأدنى {lowest}',
    priceNotGiven: 'لم يُحدَّد بعد',
    kinds: { one_time: "دفعة واحدة", milestones: 'على مراحل', goods: "سلع" },
    kindNotes: { one_time: "دفعة واحدة وفق قواعد التحرير المتفق عليها", milestones: "دفعات حسب المراحل وفق قواعد التحرير المتفق عليها", goods: "تسليم سلع وفق قواعد المراجعة والتحرير المتفق عليها" },
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
      maxPrice: "حد ميزانية الشراء، USDC",
      waitDays: 'كم يمكنك الانتظار، بالأيام',
    },
    problems: { missing: 'املأ كل الخانات.', order: 'لا يمكن أن يتجاوز الأدنى السعر المعتاد.', daysOrder: 'لا يمكن أن يكون الأسرع أطول من الأطول.' },
    recordSources: 'من أين يأتي سجلك',
    find: {
      beFound: "كن مرئيًا",
      beFoundBody: "يعرضك وكيلك على من يحتاجون ما تبيعه، بالقرب منك أو عبر الإنترنت.",
      letFind: "اسمح للوكلاء بإيجادي",
      reach: "اسمح للبائعين بالتواصل معي",
      reachBody: "يمكن للبائعين القريبين تقديم عروض لما تحتاجه بانتظام. لا يُدفع شيء حتى توافق.",
      letReach: "اسمح للبائعين بالتواصل معي",
      off: "متوقف",
      onWays: "مفعّل · {ways}",
      onNeeds: "مفعّل · {n} احتياجات",
      onOneNeed: "مفعّل · احتياج واحد",
      onNoNeeds: "مفعّل · لا احتياجات بعد",
      newTag: "جديد",
      whereYouAre: "أين أنت",
      whereNotSet: "غير محدد. أخبر مساعدك أين أنت.",
      whereNote: "يُستخدم فقط لمعرفة المسافة. يرى الآخرون المسافة، ولا يرون مكانك أبدًا.",
      howMeet: "كيف تلتقي بالناس",
      atPlace: "في متجري أو مكاني",
      atPlaceNote: "يأتي الناس إليك",
      goTo: "أذهب إليهم",
      goToNote: "إلى أي مدى تتنقل",
      km: "{n} كم",
      online: "عبر الإنترنت",
      onlineNote: "عمل يُنجز ويُرسل عبر الإنترنت",
      atPlaceShort: "في متجرك",
      goToShort: "تذهب إلى الناس حتى {n} كم",
      onlineShort: "عبر الإنترنت",
      meetMissing: "اختر طريقة واحدة على الأقل للقاء الناس.",
      whoAlerts: "من يمكنه إرسال تنبيهات الصفقات إليك",
      anyone: "أي شخص على كاروان",
      verified: "الأشخاص الموثَّقون فقط",
      needsLabel: "ما تحتاجه بانتظام",
      needsNote: "يمكن للبائعين المناسبين تقديم عروض لها ما دام الخيار مفعّلًا. أوقف احتياجًا مؤقتًا لإيقاف العروض عليه.",
      noNeeds: "لا شيء بعد.",
      addNeed: "أضف احتياجًا",
      addNeedTitle: "أضف احتياجًا",
      changeNeedTitle: "غيّر هذا الاحتياج",
      addNeedCta: "أضف",
      removeNeed: "احذف",
      pause: "إيقاف مؤقت",
      resume: "استئناف",
      paused: "موقوف مؤقتًا",
      needWhat: "ما تحتاجه",
      howOften: "كم مرة",
      every: {
        once: "مرة واحدة",
        week: "كل أسبوع",
        month: "كل شهر",
        season: "كل موسم"
      },
      budgetEach: "ميزانية تقريبية في كل مرة",
      reachesYou: "كيف يصلك",
      reaches: {
        goods: "توصيل",
        in_person: "في مكاني",
        remote: "عبر الإنترنت"
      },
      about: "نحو {budget}",
      tooMany: "يمكنك الاحتفاظ بما يصل إلى 10 احتياجات. احذف واحدًا أولًا."
    },
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
    rows: { sell: 'आप क्या बेचते हैं', price: 'आपकी कीमत', paid: 'आपको भुगतान कैसे मिलता है', alone: "एजेंट की अनुमतियाँ", buy: 'जब आप खरीदते हैं' },
    notSet: 'तय नहीं',
    priceLine: 'आमतौर पर {usual} USDC, सबसे कम {lowest}',
    priceNotGiven: 'अभी नहीं बताई',
    kinds: { one_time: "एक भुगतान", milestones: 'चरणों में', goods: "सामान" },
    kindNotes: { one_time: "सहमत भुगतान जारी करने के नियमों के अनुसार एक भुगतान", milestones: "सहमत नियमों के अनुसार चरणों में भुगतान", goods: "सहमत समीक्षा और भुगतान नियमों के साथ सामान की डिलीवरी" },
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
      maxPrice: "खरीद बजट सीमा, USDC",
      waitDays: 'आप कितने दिन इंतज़ार कर सकते हैं',
    },
    problems: { missing: 'हर खाना भरें।', order: 'सबसे कम कीमत सामान्य कीमत से ज़्यादा नहीं हो सकती।', daysOrder: 'सबसे जल्दी, सबसे देर से लंबा नहीं हो सकता।' },
    recordSources: 'आपका रिकॉर्ड कहां से आता है',
    find: {
      beFound: "खोजे जाएं",
      beFoundBody: "आपका एजेंट आपको उन लोगों को दिखाता है जिन्हें आपकी चीज़ चाहिए, आपके पास या ऑनलाइन।",
      letFind: "एजेंटों को मुझे खोजने दें",
      reach: "विक्रेताओं को मुझ तक पहुंचने दें",
      reachBody: "पास के विक्रेता आपकी नियमित ज़रूरतों के लिए ऑफ़र दे सकते हैं। आपकी हां से पहले कुछ नहीं चुकाया जाता।",
      letReach: "विक्रेताओं को मुझ तक पहुंचने दें",
      off: "बंद",
      onWays: "चालू · {ways}",
      onNeeds: "चालू · {n} ज़रूरतें",
      onOneNeed: "चालू · 1 ज़रूरत",
      onNoNeeds: "चालू · अभी कोई ज़रूरत नहीं",
      newTag: "नया",
      whereYouAre: "आप कहां हैं",
      whereNotSet: "तय नहीं। अपने असिस्टेंट को बताएं कि आप कहां हैं।",
      whereNote: "सिर्फ़ दूरी जानने के लिए। दूसरों को दूरी दिखती है, आपकी जगह कभी नहीं।",
      howMeet: "आप लोगों से कैसे मिलते हैं",
      atPlace: "मेरी दुकान या जगह पर",
      atPlaceNote: "लोग आपके पास आते हैं",
      goTo: "मैं उनके पास जाता हूं",
      goToNote: "आप कितनी दूर जाते हैं",
      km: "{n} किमी",
      online: "ऑनलाइन",
      onlineNote: "काम ऑनलाइन होकर भेजा जाता है",
      atPlaceShort: "आपकी दुकान पर",
      goToShort: "आप {n} किमी तक लोगों के पास जाते हैं",
      onlineShort: "ऑनलाइन",
      meetMissing: "लोगों से मिलने का कम से कम एक तरीका चुनें।",
      whoAlerts: "कौन आपको डील अलर्ट भेज सकता है",
      anyone: "Karwan पर कोई भी",
      verified: "सिर्फ़ सत्यापित लोग",
      needsLabel: "आपको नियमित रूप से क्या चाहिए",
      needsNote: "जब तक यह चालू है, सही विक्रेता इनके लिए ऑफ़र दे सकते हैं। ऑफ़र रोकने के लिए किसी ज़रूरत को रोकें।",
      noNeeds: "अभी कुछ नहीं।",
      addNeed: "ज़रूरत जोड़ें",
      addNeedTitle: "ज़रूरत जोड़ें",
      changeNeedTitle: "यह ज़रूरत बदलें",
      addNeedCta: "जोड़ें",
      removeNeed: "हटाएं",
      pause: "रोकें",
      resume: "फिर शुरू करें",
      paused: "रुका हुआ",
      needWhat: "आपको क्या चाहिए",
      howOften: "कितनी बार",
      every: {
        once: "एक बार",
        week: "हर हफ़्ते",
        month: "हर महीने",
        season: "हर मौसम"
      },
      budgetEach: "हर बार का अनुमानित बजट",
      reachesYou: "यह आप तक कैसे पहुंचे",
      reaches: {
        goods: "डिलीवरी",
        in_person: "मेरी जगह पर",
        remote: "ऑनलाइन"
      },
      about: "लगभग {budget}",
      tooMany: "आप 10 तक ज़रूरतें रख सकते हैं। पहले एक हटाएं।"
    },
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
    rows: { sell: 'Unachouza', price: 'Bei yako', paid: 'Unavyolipwa', alone: "Ruhusa za wakala", buy: 'Unaponunua' },
    notSet: 'Haijawekwa',
    priceLine: 'Kwa kawaida {usual} USDC, chini kabisa {lowest}',
    priceNotGiven: 'Bado haijawekwa',
    kinds: { one_time: "Malipo moja", milestones: 'Kwa hatua', goods: "Bidhaa" },
    kindNotes: { one_time: "Malipo moja kulingana na sheria mlizokubaliana", milestones: "Malipo kwa hatua kulingana na sheria mlizokubaliana", goods: "Uwasilishaji wa bidhaa kwa sheria za ukaguzi na malipo mlizokubaliana" },
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
      maxPrice: "Kikomo cha bajeti ya ununuzi, USDC",
      waitDays: 'Unaweza kusubiri siku ngapi',
    },
    problems: { missing: 'Jaza kila kisanduku.', order: 'Bei ya chini haiwezi kuzidi bei ya kawaida.', daysOrder: 'Haraka zaidi haiwezi kuzidi muda mrefu zaidi.' },
    recordSources: 'Rekodi yako inatoka wapi',
    find: {
      beFound: "Patikana",
      beFoundBody: "Wakala wako anakuonyesha kwa watu wanaohitaji unachouza, karibu nawe au mtandaoni.",
      letFind: "Ruhusu mawakala wanipate",
      reach: "Ruhusu wauzaji wanifikie",
      reachBody: "Wauzaji walio karibu wanaweza kutoa ofa kwa unachohitaji mara kwa mara. Hakuna kinacholipwa hadi ukubali.",
      letReach: "Ruhusu wauzaji wanifikie",
      off: "Imezimwa",
      onWays: "Imewashwa · {ways}",
      onNeeds: "Imewashwa · mahitaji {n}",
      onOneNeed: "Imewashwa · hitaji 1",
      onNoNeeds: "Imewashwa · bado hakuna mahitaji",
      newTag: "Mpya",
      whereYouAre: "Ulipo",
      whereNotSet: "Haijawekwa. Mwambie msaidizi wako ulipo.",
      whereNote: "Hutumika tu kujua umbali. Wengine wanaona umbali, kamwe si mahali ulipo.",
      howMeet: "Unavyokutana na watu",
      atPlace: "Dukani kwangu au mahali pangu",
      atPlaceNote: "Watu wanakuja kwako",
      goTo: "Ninawaendea",
      goToNote: "Umbali unaosafiri",
      km: "km {n}",
      online: "Mtandaoni",
      onlineNote: "Kazi hufanywa na kutumwa mtandaoni",
      atPlaceShort: "dukani kwako",
      goToShort: "unawaendea watu hadi km {n}",
      onlineShort: "mtandaoni",
      meetMissing: "Chagua angalau njia moja ya kukutana na watu.",
      whoAlerts: "Nani anaweza kukutumia arifa za mikataba",
      anyone: "Yeyote kwenye Karwan",
      verified: "Watu waliothibitishwa tu",
      needsLabel: "Unachohitaji mara kwa mara",
      needsNote: "Wauzaji wanaofaa wanaweza kutoa ofa kwa haya wakati chaguo limewashwa. Sitisha hitaji ili kusimamisha ofa.",
      noNeeds: "Bado hakuna.",
      addNeed: "Ongeza hitaji",
      addNeedTitle: "Ongeza hitaji",
      changeNeedTitle: "Badilisha hitaji hili",
      addNeedCta: "Ongeza",
      removeNeed: "Ondoa",
      pause: "Sitisha",
      resume: "Endelea",
      paused: "Imesitishwa",
      needWhat: "Unachohitaji",
      howOften: "Mara ngapi",
      every: {
        once: "Mara moja",
        week: "Kila wiki",
        month: "Kila mwezi",
        season: "Kila msimu"
      },
      budgetEach: "Bajeti ya takriban kila mara",
      reachesYou: "Kinavyokufikia",
      reaches: {
        goods: "Kuletewa",
        in_person: "Mahali pangu",
        remote: "Mtandaoni"
      },
      about: "takriban {budget}",
      tooMany: "Unaweza kuweka hadi mahitaji 10. Ondoa moja kwanza."
    },
  },
};
