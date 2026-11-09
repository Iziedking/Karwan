/// People an agent found (docs/architecture/72-your-agent-finds-the-people.md):
/// the card in the assistant, the find page and one person's sheet.
export interface FindPeopleCopy {
  back: string;
  /// {n} people.
  nearYou: string;
  nearYouOne: string;
  found: string;
  foundOne: string;
  privateToYou: string;
  /// {day} is a short date.
  endsOn: string;
  ended: string;
  /// {amount} is money in the person's currency.
  about: string;
  kinds: Record<'in_person' | 'remote' | 'goods', string>;
  /// {day} is a short date.
  byDay: string;
  /// Best match, then 2nd to 5th.
  ranks: [string, string, string, string, string];
  askPrice: string;
  /// {stars} is the rating, {n} how many deals it is from.
  rated: string;
  newOnKarwan: string;
  distance: { nearby: string; about: string; inCity: string; far: string; sameCountry: string };
  verified: string;
  tiles: { rating: string; deals: string; away: string };
  facts: { price: string; readyIn: string; works: string; why: string };
  /// {n} days.
  days: string;
  oneDay: string;
  meet: { atPlace: string; comesTo: string; online: string };
  reasons: Record<'best_fit' | 'nearby' | 'verified' | 'within_budget' | 'on_time_record', string>;
  /// {name} is their first name.
  message: string;
  record: string;
  close: string;
  /// {n} people found.
  cardFound: string;
  cardFoundOne: string;
  seeAll: string;
  seeOne: string;
  loading: string;
  failed: string;
  retry: string;
  notFound: string;
  /// Phase 3: picking people and asking them.
  pick: string;
  unpick: string;
  /// {n} picked of up to 3.
  picked: string;
  askOne: string;
  /// {n} people.
  askMany: string;
  /// {names} are the first names picked.
  confirmTitle: string;
  confirmSub: string;
  confirmFacts: { need: string; budget: string; by: string; theySee: string; theySeeValue: string };
  nothingPaid: string;
  sendOne: string;
  /// {n} people.
  sendMany: string;
  sending: string;
  sendFailed: string;
  /// {amount} is what to add.
  fundFirst: string;
  addMoney: string;
  askedOne: string;
  /// {n} people.
  askedMany: string;
  askedSub: string;
  status: { offered: string; waiting: string; declined: string; noAnswer: string };
  /// {time} is the next reminder.
  reminderAt: string;
  reviewOffers: string;
  /// Phase 4, a seller's buyers. {n} buyers.
  buyers: string;
  buyersOne: string;
  buyersSub: string;
  every: Record<'once' | 'week' | 'month' | 'season', string>;
  /// {n} days.
  dueIn: string;
  dueOne: string;
  noBudget: string;
  leadKind: Record<'need' | 'request', string>;
  offeredTag: string;
  /// {n} picked.
  pickedCount: string;
  offerOne: string;
  /// {n} buyers.
  offerMany: string;
  offerFields: { price: string; days: string; note: string; notePlaceholder: string; theySee: string; theySeeValue: string };
  offerSub: string;
  sendBuyersOne: string;
  /// {n} buyers.
  sendBuyersMany: string;
  notNow: string;
  pitchSent: string;
  /// {n} needs.
  pitchRefused: string;
  /// Phase 4, the buyer's side of a pitch. {name} is the seller's first name.
  yourNeed: string;
  theirOffer: string;
  noteLabel: string;
  interested: string;
  notInterested: string;
  askFor: string;
  askForSub: string;
  whoSees: string;
  whoSeesValue: string;
  payNote: string;
  postPrivately: string;
  postedTitle: string;
  postedSub: string;
  offerWord: string;
  reviewOffer: string;
  backToNeeds: string;
  saidNotNow: string;
  saidNo: string;
  pitchGone: string;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const findPeopleCopy: Record<Locale, FindPeopleCopy> = {
  en: {
    back: 'Assistant',
    nearYou: '{n} people near you',
    nearYouOne: 'One person near you',
    found: '{n} people found',
    foundOne: 'One person found',
    privateToYou: 'Private to you',
    endsOn: 'Ends {day}',
    ended: 'Ended',
    about: 'About {amount}',
    kinds: { in_person: 'In person', remote: 'Online', goods: 'Delivered' },
    byDay: 'By {day}',
    ranks: ['Best match', '2nd', '3rd', '4th', '5th'],
    askPrice: 'Asks a price',
    rated: '{stars} from {n} deals',
    newOnKarwan: 'New on Karwan',
    distance: { nearby: 'Nearby', about: '{km} km', inCity: 'In {city}', far: '{km} km away', sameCountry: 'In your country' },
    verified: 'Verified',
    tiles: { rating: 'Rating', deals: 'Deals', away: 'Away' },
    facts: { price: 'Price', readyIn: 'Ready in', works: 'Works', why: 'Why' },
    days: '{n} days',
    oneDay: '1 day',
    meet: { atPlace: 'At their place', comesTo: 'Comes to you', online: 'Online' },
    reasons: { best_fit: 'Best fit', nearby: 'Nearby', verified: 'Verified', within_budget: 'Within budget', on_time_record: 'On time' },
    message: 'Message {name}',
    record: 'See full record',
    close: 'Close',
    cardFound: '{n} found · private to you',
    cardFoundOne: 'One found · private to you',
    seeAll: 'See all {n}',
    seeOne: 'See them',
    loading: 'Loading the people',
    failed: 'The people could not load.',
    retry: 'Try again',
    notFound: 'Nothing here. A list of people found is only for the person who asked.',
    pick: 'Pick {name}',
    unpick: 'Unpick {name}',
    picked: '{n} of 3 picked',
    askOne: 'Ask 1 person',
    askMany: 'Ask {n} people',
    confirmTitle: 'Ask {names}',
    confirmSub: 'Each gets one message from your agent',
    confirmFacts: { need: 'Need', budget: 'Budget', by: 'By', theySee: 'They see', theySeeValue: 'How far you are, not where' },
    nothingPaid: 'Nothing is paid until you pick an offer.',
    sendOne: 'Send to 1 person',
    sendMany: 'Send to {n} people',
    sending: 'Sending',
    sendFailed: 'It did not send. Try again.',
    fundFirst: 'Add {amount} to your buyer agent first, then ask.',
    addMoney: 'Add money',
    askedOne: 'Asked 1 person',
    askedMany: 'Asked {n} people',
    askedSub: 'We tell you when they answer',
    status: { offered: 'Sent an offer', waiting: 'Not answered yet', declined: 'Said no thanks', noAnswer: 'No answer' },
    reminderAt: 'Reminder at {time}',
    reviewOffers: 'Review offers',
    buyers: '{n} buyers near you',
    buyersOne: '1 buyer near you',
    buyersSub: 'Buyers are not named',
    every: { once: 'Once', week: 'Every week', month: 'Every month', season: 'Each season' },
    dueIn: 'due in {n} days',
    dueOne: 'due tomorrow',
    noBudget: 'No budget said',
    leadKind: { need: 'Regular need', request: 'Open request' },
    offeredTag: 'Offered',
    pickedCount: '{n} picked',
    offerOne: 'Offer to help 1 buyer',
    offerMany: 'Offer to help {n} buyers',
    offerFields: { price: 'Your price', days: 'Ready in (days)', note: 'Note', notePlaceholder: 'What you would bring', theySee: 'They see', theySeeValue: 'Your name, rating, how far' },
    offerSub: 'Each gets one message and one reminder. Nothing is paid until they say yes.',
    sendBuyersOne: 'Send to 1 buyer',
    sendBuyersMany: 'Send to {n} buyers',
    notNow: 'Not now',
    pitchSent: 'Sent. You hear when one is interested.',
    pitchRefused: '{n} could not be told today.',
    yourNeed: 'Your regular need',
    theirOffer: 'Their offer',
    noteLabel: 'Note',
    interested: 'I’m interested',
    notInterested: 'Not interested',
    askFor: 'Ask {name} for it',
    askForSub: 'Posted privately to {name}, with their offer on it',
    whoSees: 'Who sees it',
    whoSeesValue: 'Only you and {name}',
    payNote: 'Nothing is paid until you accept and lock the money.',
    postPrivately: 'Post privately',
    postedTitle: 'Posted privately to {name}',
    postedSub: 'Their offer is on it. Accept it when you are ready.',
    offerWord: 'Offer',
    reviewOffer: 'Review {name}’s offer',
    backToNeeds: 'Back to my needs',
    saidNotNow: 'You said not now. No offers from them for 30 days.',
    saidNo: 'You said not interested. They will not offer for this need again.',
    pitchGone: 'This offer has closed.',
  },
  fr: {
    back: 'Assistant',
    nearYou: '{n} personnes près de vous',
    nearYouOne: 'Une personne près de vous',
    found: '{n} personnes trouvées',
    foundOne: 'Une personne trouvée',
    privateToYou: 'Visible par vous seul',
    endsOn: 'Se termine le {day}',
    ended: 'Terminé',
    about: 'Environ {amount}',
    kinds: { in_person: 'En personne', remote: 'En ligne', goods: 'Livré' },
    byDay: "D'ici le {day}",
    ranks: ['Meilleur choix', '2e', '3e', '4e', '5e'],
    askPrice: 'Demande un prix',
    rated: '{stars} sur {n} affaires',
    newOnKarwan: 'Nouveau sur Karwan',
    distance: { nearby: 'Tout près', about: '{km} km', inCity: 'À {city}', far: 'À {km} km', sameCountry: 'Dans votre pays' },
    verified: 'Vérifié',
    tiles: { rating: 'Note', deals: 'Affaires', away: 'Distance' },
    facts: { price: 'Prix', readyIn: 'Prêt en', works: 'Travaille', why: 'Pourquoi' },
    days: '{n} jours',
    oneDay: '1 jour',
    meet: { atPlace: 'Chez lui ou elle', comesTo: 'Vient chez vous', online: 'En ligne' },
    reasons: { best_fit: 'Le plus adapté', nearby: 'Tout près', verified: 'Vérifié', within_budget: 'Dans le budget', on_time_record: 'Ponctuel' },
    message: 'Écrire à {name}',
    record: 'Voir tout le dossier',
    close: 'Fermer',
    cardFound: '{n} trouvées · visible par vous seul',
    cardFoundOne: 'Une trouvée · visible par vous seul',
    seeAll: 'Voir les {n}',
    seeOne: 'Voir',
    loading: 'Chargement des personnes',
    failed: "Les personnes n'ont pas pu être chargées.",
    retry: 'Réessayer',
    notFound: "Rien ici. Une liste de personnes trouvées n'est visible que par la personne qui l'a demandée.",
    pick: 'Choisir {name}',
    unpick: 'Retirer {name}',
    picked: '{n} sur 3 choisis',
    askOne: 'Demander à 1 personne',
    askMany: 'Demander à {n} personnes',
    confirmTitle: 'Demander à {names}',
    confirmSub: 'Chacun reçoit un seul message de votre agent',
    confirmFacts: { need: 'Besoin', budget: 'Budget', by: 'D\'ici le', theySee: 'Ils voient', theySeeValue: 'La distance, pas où vous êtes' },
    nothingPaid: 'Rien n\'est payé avant que vous choisissiez une offre.',
    sendOne: 'Envoyer à 1 personne',
    sendMany: 'Envoyer à {n} personnes',
    sending: 'Envoi',
    sendFailed: 'L\'envoi n\'a pas abouti. Réessayez.',
    fundFirst: 'Ajoutez d\'abord {amount} à votre agent acheteur, puis demandez.',
    addMoney: 'Ajouter des fonds',
    askedOne: '1 personne contactée',
    askedMany: '{n} personnes contactées',
    askedSub: 'Nous vous prévenons dès qu\'ils répondent',
    status: { offered: 'A envoyé une offre', waiting: 'N\'a pas encore répondu', declined: 'A dit non merci', noAnswer: 'Pas de réponse' },
    reminderAt: 'Rappel à {time}',
    reviewOffers: 'Voir les offres',
    buyers: '{n} acheteurs près de chez vous',
    buyersOne: '1 acheteur près de chez vous',
    buyersSub: 'Les acheteurs ne sont pas nommés',
    every: { once: 'Une fois', week: 'Chaque semaine', month: 'Chaque mois', season: 'Chaque saison' },
    dueIn: 'dans {n} jours',
    dueOne: 'pour demain',
    noBudget: 'Pas de budget indiqué',
    leadKind: { need: 'Besoin régulier', request: 'Demande ouverte' },
    offeredTag: 'Proposé',
    pickedCount: '{n} choisis',
    offerOne: 'Proposer à 1 acheteur',
    offerMany: 'Proposer à {n} acheteurs',
    offerFields: { price: 'Votre prix', days: 'Prêt en (jours)', note: 'Note', notePlaceholder: 'Ce que vous apporteriez', theySee: 'Ils voient', theySeeValue: 'Votre nom, votre note, la distance' },
    offerSub: 'Chacun reçoit un message et un rappel. Rien n’est payé avant leur accord.',
    sendBuyersOne: 'Envoyer à 1 acheteur',
    sendBuyersMany: 'Envoyer à {n} acheteurs',
    notNow: 'Pas maintenant',
    pitchSent: 'Envoyé. Vous serez prévenu si l’un est intéressé.',
    pitchRefused: '{n} n’ont pas pu être prévenus aujourd’hui.',
    yourNeed: 'Votre besoin régulier',
    theirOffer: 'Son offre',
    noteLabel: 'Note',
    interested: 'Je suis intéressé',
    notInterested: 'Pas intéressé',
    askFor: 'Demander à {name}',
    askForSub: 'Publié en privé pour {name}, avec son offre',
    whoSees: 'Qui la voit',
    whoSeesValue: 'Seulement vous et {name}',
    payNote: 'Rien n’est payé avant que vous acceptiez et bloquiez l’argent.',
    postPrivately: 'Publier en privé',
    postedTitle: 'Publié en privé pour {name}',
    postedSub: 'Son offre y est. Acceptez-la quand vous êtes prêt.',
    offerWord: 'Offre',
    reviewOffer: 'Voir l’offre de {name}',
    backToNeeds: 'Retour à mes besoins',
    saidNotNow: 'Vous avez dit pas maintenant. Aucune offre de sa part pendant 30 jours.',
    saidNo: 'Vous avez dit pas intéressé. Il ne proposera plus pour ce besoin.',
    pitchGone: 'Cette offre est fermée.',
  },
  ar: {
    back: 'المساعد',
    nearYou: '{n} أشخاص بالقرب منك',
    nearYouOne: 'شخص واحد بالقرب منك',
    found: 'تم العثور على {n} أشخاص',
    foundOne: 'تم العثور على شخص واحد',
    privateToYou: 'خاص بك',
    endsOn: 'ينتهي في {day}',
    ended: 'انتهى',
    about: 'حوالي {amount}',
    kinds: { in_person: 'حضوريًا', remote: 'عبر الإنترنت', goods: 'توصيل' },
    byDay: 'بحلول {day}',
    ranks: ['الأنسب', 'الثاني', 'الثالث', 'الرابع', 'الخامس'],
    askPrice: 'يطلب سعرًا',
    rated: '{stars} من {n} صفقات',
    newOnKarwan: 'جديد على Karwan',
    distance: { nearby: 'قريب', about: '{km} كم', inCity: 'في {city}', far: 'على بعد {km} كم', sameCountry: 'في بلدك' },
    verified: 'موثّق',
    tiles: { rating: 'التقييم', deals: 'الصفقات', away: 'المسافة' },
    facts: { price: 'السعر', readyIn: 'جاهز خلال', works: 'طريقة العمل', why: 'لماذا' },
    days: '{n} أيام',
    oneDay: 'يوم واحد',
    meet: { atPlace: 'في مكانه', comesTo: 'يأتي إليك', online: 'عبر الإنترنت' },
    reasons: { best_fit: 'الأنسب', nearby: 'قريب', verified: 'موثّق', within_budget: 'ضمن الميزانية', on_time_record: 'ملتزم بالمواعيد' },
    message: 'راسل {name}',
    record: 'عرض السجل كاملًا',
    close: 'إغلاق',
    cardFound: 'تم العثور على {n} · خاص بك',
    cardFoundOne: 'تم العثور على واحد · خاص بك',
    seeAll: 'عرض الكل ({n})',
    seeOne: 'عرض',
    loading: 'جارٍ تحميل الأشخاص',
    failed: 'تعذّر تحميل الأشخاص.',
    retry: 'حاول مرة أخرى',
    notFound: 'لا شيء هنا. قائمة الأشخاص الذين تم العثور عليهم خاصة بمن طلبها فقط.',
    pick: 'اختر {name}',
    unpick: 'ألغِ اختيار {name}',
    picked: 'تم اختيار {n} من 3',
    askOne: 'اسأل شخصًا واحدًا',
    askMany: 'اسأل {n} أشخاص',
    confirmTitle: 'اسأل {names}',
    confirmSub: 'يتلقى كل منهم رسالة واحدة من وكيلك',
    confirmFacts: { need: 'الحاجة', budget: 'الميزانية', by: 'بحلول', theySee: 'يرون', theySeeValue: 'المسافة، لا مكانك' },
    nothingPaid: 'لا يُدفع شيء حتى تختار عرضًا.',
    sendOne: 'أرسل إلى شخص واحد',
    sendMany: 'أرسل إلى {n} أشخاص',
    sending: 'جارٍ الإرسال',
    sendFailed: 'لم يُرسل. حاول مرة أخرى.',
    fundFirst: 'أضف {amount} إلى وكيل الشراء أولًا، ثم اسأل.',
    addMoney: 'أضف مالًا',
    askedOne: 'تم سؤال شخص واحد',
    askedMany: 'تم سؤال {n} أشخاص',
    askedSub: 'سنخبرك عندما يردّون',
    status: { offered: 'أرسل عرضًا', waiting: 'لم يرد بعد', declined: 'قال لا شكرًا', noAnswer: 'لا رد' },
    reminderAt: 'تذكير عند {time}',
    reviewOffers: 'راجع العروض',
    buyers: '{n} مشترين بالقرب منك',
    buyersOne: 'مشترٍ واحد بالقرب منك',
    buyersSub: 'لا تظهر أسماء المشترين',
    every: { once: 'مرة واحدة', week: 'كل أسبوع', month: 'كل شهر', season: 'كل موسم' },
    dueIn: 'خلال {n} أيام',
    dueOne: 'غدًا',
    noBudget: 'لم تُذكر ميزانية',
    leadKind: { need: 'حاجة منتظمة', request: 'طلب مفتوح' },
    offeredTag: 'تم العرض',
    pickedCount: 'تم اختيار {n}',
    offerOne: 'اعرض المساعدة على مشترٍ واحد',
    offerMany: 'اعرض المساعدة على {n} مشترين',
    offerFields: { price: 'سعرك', days: 'جاهز خلال (أيام)', note: 'ملاحظة', notePlaceholder: 'ما الذي ستقدمه', theySee: 'يرون', theySeeValue: 'اسمك وتقييمك والمسافة' },
    offerSub: 'يتلقى كل منهم رسالة واحدة وتذكيرًا واحدًا. لا يُدفع شيء حتى يوافقوا.',
    sendBuyersOne: 'أرسل إلى مشترٍ واحد',
    sendBuyersMany: 'أرسل إلى {n} مشترين',
    notNow: 'ليس الآن',
    pitchSent: 'تم الإرسال. ستعرف عندما يهتم أحدهم.',
    pitchRefused: 'تعذّر إبلاغ {n} اليوم.',
    yourNeed: 'حاجتك المنتظمة',
    theirOffer: 'عرضه',
    noteLabel: 'ملاحظة',
    interested: 'أنا مهتم',
    notInterested: 'غير مهتم',
    askFor: 'اطلبها من {name}',
    askForSub: 'يُنشر بشكل خاص إلى {name} مع عرضه عليه',
    whoSees: 'من يراه',
    whoSeesValue: 'أنت و{name} فقط',
    payNote: 'لا يُدفع شيء حتى تقبل وتحجز المال.',
    postPrivately: 'انشر بشكل خاص',
    postedTitle: 'نُشر بشكل خاص إلى {name}',
    postedSub: 'عرضه عليه الآن. اقبله عندما تكون مستعدًا.',
    offerWord: 'عرض',
    reviewOffer: 'راجع عرض {name}',
    backToNeeds: 'العودة إلى احتياجاتي',
    saidNotNow: 'قلت ليس الآن. لا عروض منه لمدة 30 يومًا.',
    saidNo: 'قلت غير مهتم. لن يعرض على هذه الحاجة مرة أخرى.',
    pitchGone: 'أُغلق هذا العرض.',
  },
  hi: {
    back: 'सहायक',
    nearYou: 'आपके पास {n} लोग',
    nearYouOne: 'आपके पास एक व्यक्ति',
    found: '{n} लोग मिले',
    foundOne: 'एक व्यक्ति मिला',
    privateToYou: 'सिर्फ़ आपके लिए',
    endsOn: '{day} को खत्म',
    ended: 'खत्म',
    about: 'लगभग {amount}',
    kinds: { in_person: 'आमने-सामने', remote: 'ऑनलाइन', goods: 'डिलीवरी' },
    byDay: '{day} तक',
    ranks: ['सबसे सही', 'दूसरा', 'तीसरा', 'चौथा', 'पाँचवाँ'],
    askPrice: 'कीमत पूछेंगे',
    rated: '{n} सौदों से {stars}',
    newOnKarwan: 'Karwan पर नए',
    distance: { nearby: 'पास में', about: '{km} किमी', inCity: '{city} में', far: '{km} किमी दूर', sameCountry: 'आपके देश में' },
    verified: 'सत्यापित',
    tiles: { rating: 'रेटिंग', deals: 'सौदे', away: 'दूरी' },
    facts: { price: 'कीमत', readyIn: 'तैयार होगा', works: 'काम का तरीका', why: 'क्यों' },
    days: '{n} दिन',
    oneDay: '1 दिन',
    meet: { atPlace: 'उनकी जगह पर', comesTo: 'आपके पास आते हैं', online: 'ऑनलाइन' },
    reasons: { best_fit: 'सबसे सही', nearby: 'पास में', verified: 'सत्यापित', within_budget: 'बजट में', on_time_record: 'समय पर' },
    message: '{name} को संदेश भेजें',
    record: 'पूरा रिकॉर्ड देखें',
    close: 'बंद करें',
    cardFound: '{n} मिले · सिर्फ़ आपके लिए',
    cardFoundOne: 'एक मिला · सिर्फ़ आपके लिए',
    seeAll: 'सभी {n} देखें',
    seeOne: 'देखें',
    loading: 'लोग लोड हो रहे हैं',
    failed: 'लोग लोड नहीं हो सके।',
    retry: 'फिर कोशिश करें',
    notFound: 'यहाँ कुछ नहीं है। मिले हुए लोगों की सूची सिर्फ़ पूछने वाले के लिए है।',
    pick: '{name} चुनें',
    unpick: '{name} हटाएँ',
    picked: '3 में से {n} चुने',
    askOne: '1 व्यक्ति से पूछें',
    askMany: '{n} लोगों से पूछें',
    confirmTitle: '{names} से पूछें',
    confirmSub: 'हर एक को आपके एजेंट से एक संदेश मिलेगा',
    confirmFacts: { need: 'ज़रूरत', budget: 'बजट', by: 'तक', theySee: 'वे देखेंगे', theySeeValue: 'आप कितनी दूर हैं, कहाँ नहीं' },
    nothingPaid: 'जब तक आप कोई ऑफ़र नहीं चुनते, कुछ भुगतान नहीं होता।',
    sendOne: '1 व्यक्ति को भेजें',
    sendMany: '{n} लोगों को भेजें',
    sending: 'भेजा जा रहा है',
    sendFailed: 'नहीं भेजा जा सका। फिर कोशिश करें।',
    fundFirst: 'पहले अपने खरीदार एजेंट में {amount} जोड़ें, फिर पूछें।',
    addMoney: 'पैसे जोड़ें',
    askedOne: '1 व्यक्ति से पूछा',
    askedMany: '{n} लोगों से पूछा',
    askedSub: 'जवाब आते ही हम आपको बताएँगे',
    status: { offered: 'ऑफ़र भेजा', waiting: 'अभी जवाब नहीं', declined: 'मना कर दिया', noAnswer: 'कोई जवाब नहीं' },
    reminderAt: '{time} पर याद दिलाएँगे',
    reviewOffers: 'ऑफ़र देखें',
    buyers: 'आपके पास {n} खरीदार',
    buyersOne: 'आपके पास 1 खरीदार',
    buyersSub: 'खरीदारों के नाम नहीं दिखते',
    every: { once: 'एक बार', week: 'हर हफ़्ते', month: 'हर महीने', season: 'हर मौसम' },
    dueIn: '{n} दिन में',
    dueOne: 'कल तक',
    noBudget: 'बजट नहीं बताया',
    leadKind: { need: 'नियमित ज़रूरत', request: 'खुला अनुरोध' },
    offeredTag: 'ऑफ़र भेजा',
    pickedCount: '{n} चुने',
    offerOne: '1 खरीदार को ऑफ़र दें',
    offerMany: '{n} खरीदारों को ऑफ़र दें',
    offerFields: { price: 'आपकी कीमत', days: 'कितने दिन में तैयार', note: 'नोट', notePlaceholder: 'आप क्या देंगे', theySee: 'वे देखेंगे', theySeeValue: 'आपका नाम, रेटिंग, दूरी' },
    offerSub: 'हर एक को एक संदेश और एक याद दिलाना मिलेगा। उनकी हाँ तक कुछ भुगतान नहीं होता।',
    sendBuyersOne: '1 खरीदार को भेजें',
    sendBuyersMany: '{n} खरीदारों को भेजें',
    notNow: 'अभी नहीं',
    pitchSent: 'भेज दिया। किसी को रुचि होने पर आपको पता चलेगा।',
    pitchRefused: '{n} को आज नहीं बताया जा सका।',
    yourNeed: 'आपकी नियमित ज़रूरत',
    theirOffer: 'उनका ऑफ़र',
    noteLabel: 'नोट',
    interested: 'मुझे रुचि है',
    notInterested: 'रुचि नहीं',
    askFor: '{name} से माँगें',
    askForSub: '{name} को निजी रूप से भेजा जाएगा, उनके ऑफ़र के साथ',
    whoSees: 'कौन देखेगा',
    whoSeesValue: 'सिर्फ़ आप और {name}',
    payNote: 'जब तक आप स्वीकार करके पैसा लॉक नहीं करते, कुछ भुगतान नहीं होता।',
    postPrivately: 'निजी रूप से भेजें',
    postedTitle: '{name} को निजी रूप से भेजा',
    postedSub: 'उनका ऑफ़र उस पर है। तैयार हों तो स्वीकार करें।',
    offerWord: 'ऑफ़र',
    reviewOffer: '{name} का ऑफ़र देखें',
    backToNeeds: 'मेरी ज़रूरतों पर वापस',
    saidNotNow: 'आपने अभी नहीं कहा। 30 दिन तक उनसे कोई ऑफ़र नहीं।',
    saidNo: 'आपने रुचि नहीं कहा। वे इस ज़रूरत के लिए फिर ऑफ़र नहीं देंगे।',
    pitchGone: 'यह ऑफ़र बंद हो गया है।',
  },
  sw: {
    back: 'Msaidizi',
    nearYou: 'Watu {n} karibu nawe',
    nearYouOne: 'Mtu mmoja karibu nawe',
    found: 'Watu {n} wamepatikana',
    foundOne: 'Mtu mmoja amepatikana',
    privateToYou: 'Ni yako peke yako',
    endsOn: 'Inaisha {day}',
    ended: 'Imeisha',
    about: 'Takriban {amount}',
    kinds: { in_person: 'Ana kwa ana', remote: 'Mtandaoni', goods: 'Kuletewa' },
    byDay: 'Kufikia {day}',
    ranks: ['Anayefaa zaidi', 'Wa 2', 'Wa 3', 'Wa 4', 'Wa 5'],
    askPrice: 'Atauliza bei',
    rated: '{stars} kutoka mikataba {n}',
    newOnKarwan: 'Mpya kwenye Karwan',
    distance: { nearby: 'Karibu', about: 'Km {km}', inCity: 'Ndani ya {city}', far: 'Km {km} mbali', sameCountry: 'Katika nchi yako' },
    verified: 'Amethibitishwa',
    tiles: { rating: 'Ukadiriaji', deals: 'Mikataba', away: 'Umbali' },
    facts: { price: 'Bei', readyIn: 'Tayari ndani ya', works: 'Anavyofanya kazi', why: 'Kwa nini' },
    days: 'Siku {n}',
    oneDay: 'Siku 1',
    meet: { atPlace: 'Mahali pake', comesTo: 'Anakuja kwako', online: 'Mtandaoni' },
    reasons: { best_fit: 'Anafaa zaidi', nearby: 'Karibu', verified: 'Amethibitishwa', within_budget: 'Ndani ya bajeti', on_time_record: 'Kwa wakati' },
    message: 'Mtumie {name} ujumbe',
    record: 'Tazama rekodi kamili',
    close: 'Funga',
    cardFound: '{n} wamepatikana · ni yako peke yako',
    cardFoundOne: 'Mmoja amepatikana · ni yako peke yako',
    seeAll: 'Tazama wote {n}',
    seeOne: 'Tazama',
    loading: 'Inapakia watu',
    failed: 'Watu hawakuweza kupakia.',
    retry: 'Jaribu tena',
    notFound: 'Hakuna kitu hapa. Orodha ya watu waliopatikana ni ya aliyeuliza peke yake.',
    pick: 'Chagua {name}',
    unpick: 'Ondoa {name}',
    picked: '{n} kati ya 3 wamechaguliwa',
    askOne: 'Uliza mtu 1',
    askMany: 'Uliza watu {n}',
    confirmTitle: 'Uliza {names}',
    confirmSub: 'Kila mmoja anapata ujumbe mmoja kutoka kwa wakala wako',
    confirmFacts: { need: 'Hitaji', budget: 'Bajeti', by: 'Kufikia', theySee: 'Wanaona', theySeeValue: 'Umbali wako, si mahali ulipo' },
    nothingPaid: 'Hakuna kinacholipwa hadi uchague ofa.',
    sendOne: 'Tuma kwa mtu 1',
    sendMany: 'Tuma kwa watu {n}',
    sending: 'Inatuma',
    sendFailed: 'Haikutumwa. Jaribu tena.',
    fundFirst: 'Ongeza {amount} kwa wakala wako wa kununua kwanza, kisha uliza.',
    addMoney: 'Ongeza pesa',
    askedOne: 'Umemuuliza mtu 1',
    askedMany: 'Umewauliza watu {n}',
    askedSub: 'Tutakuambia watakapojibu',
    status: { offered: 'Ametuma ofa', waiting: 'Bado hajajibu', declined: 'Amesema hapana asante', noAnswer: 'Hakuna jibu' },
    reminderAt: 'Kumbusho saa {time}',
    reviewOffers: 'Tazama ofa',
    buyers: 'Wanunuzi {n} karibu nawe',
    buyersOne: 'Mnunuzi 1 karibu nawe',
    buyersSub: 'Majina ya wanunuzi hayaonyeshwi',
    every: { once: 'Mara moja', week: 'Kila wiki', month: 'Kila mwezi', season: 'Kila msimu' },
    dueIn: 'ndani ya siku {n}',
    dueOne: 'kesho',
    noBudget: 'Bajeti haikutajwa',
    leadKind: { need: 'Hitaji la kawaida', request: 'Ombi lililo wazi' },
    offeredTag: 'Umetuma ofa',
    pickedCount: '{n} wamechaguliwa',
    offerOne: 'Mpe ofa mnunuzi 1',
    offerMany: 'Wape ofa wanunuzi {n}',
    offerFields: { price: 'Bei yako', days: 'Tayari ndani ya (siku)', note: 'Maelezo', notePlaceholder: 'Utaleta nini', theySee: 'Wanaona', theySeeValue: 'Jina lako, ukadiriaji, umbali' },
    offerSub: 'Kila mmoja anapata ujumbe mmoja na kumbusho moja. Hakuna kinacholipwa hadi wakubali.',
    sendBuyersOne: 'Tuma kwa mnunuzi 1',
    sendBuyersMany: 'Tuma kwa wanunuzi {n}',
    notNow: 'Si sasa',
    pitchSent: 'Imetumwa. Utajua mmoja akivutiwa.',
    pitchRefused: '{n} hawakuweza kuambiwa leo.',
    yourNeed: 'Hitaji lako la kawaida',
    theirOffer: 'Ofa yao',
    noteLabel: 'Maelezo',
    interested: 'Ninavutiwa',
    notInterested: 'Sivutiwi',
    askFor: 'Mwombe {name}',
    askForSub: 'Inatumwa kwa faragha kwa {name}, pamoja na ofa yao',
    whoSees: 'Nani anaiona',
    whoSeesValue: 'Wewe na {name} tu',
    payNote: 'Hakuna kinacholipwa hadi ukubali na kufunga pesa.',
    postPrivately: 'Tuma kwa faragha',
    postedTitle: 'Imetumwa kwa faragha kwa {name}',
    postedSub: 'Ofa yao iko juu yake. Ikubali ukiwa tayari.',
    offerWord: 'Ofa',
    reviewOffer: 'Tazama ofa ya {name}',
    backToNeeds: 'Rudi kwenye mahitaji yangu',
    saidNotNow: 'Umesema si sasa. Hakuna ofa kutoka kwao kwa siku 30.',
    saidNo: 'Umesema huvutiwi. Hawatatoa ofa tena kwa hitaji hili.',
    pitchGone: 'Ofa hii imefungwa.',
  },
};
