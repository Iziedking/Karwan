import type { Locale } from '../locales';

/// Standing orders on Your agent (view 87, step 4): the group, the sheet that
/// adds one and the sheet of one order.
export interface AgentOrdersCopy {
  title: string;
  /// Behind the (i) on the group and on the new order sheet.
  note: string;
  add: string;
  newOrder: string;
  find: string;
  sell: string;
  most: string;
  side: string;
  sides: { buy: string; sell: string };
  reaches: string;
  kinds: { goods: string; in_person: string; remote: string };
  until: string;
  untilStop: string;
  perDay: string;
  start: string;
  notNow: string;
  /// {amount} is a money figure.
  upTo: string;
  usualPrice: string;
  /// {city} is the person's own city.
  inCity: string;
  /// {date} is a day, as "Fri 20 Nov".
  untilDate: string;
  untilStopLine: string;
  /// {n} is a count.
  askedToday: string;
  paused: string;
  done: string;
  ended: string;
  needsLocation: string;
  needsMoney: string;
  askedTodayLabel: string;
  thisWeek: string;
  /// {asked} and {offers} are counts.
  weekLine: string;
  pause: string;
  resume: string;
  stop: string;
  save: string;
  failed: string;
  resting: string;
}

const en: AgentOrdersCopy = {
  title: 'Standing orders',
  note: 'Your agent posts this privately and asks people for it each day, inside your limits. It moves no money.',
  add: 'Add an order',
  newOrder: 'New order',
  find: 'What it should find',
  sell: 'What it should sell',
  most: 'The most for one',
  side: 'Buying or selling',
  sides: { buy: 'Buying', sell: 'Selling' },
  reaches: 'How it reaches you',
  kinds: { goods: 'Delivered', in_person: 'In person', remote: 'Online' },
  until: 'Until',
  untilStop: 'You stop it',
  perDay: 'People a day',
  start: 'Start the order',
  notNow: 'Not now',
  upTo: 'Up to {amount} each',
  usualPrice: 'At your usual price',
  inCity: 'In {city}',
  untilDate: 'until {date}',
  untilStopLine: 'until you stop it',
  askedToday: '{n} asked today',
  paused: 'Paused',
  done: 'Done',
  ended: 'Ended',
  needsLocation: 'Needs your area',
  needsMoney: 'Needs money',
  askedTodayLabel: 'Asked today',
  thisWeek: 'This week',
  weekLine: '{asked} asked, {offers} offers',
  pause: 'Pause',
  resume: 'Resume',
  stop: 'Stop this order',
  save: 'Save',
  failed: 'That did not save. Try again.',
  resting: 'Your agent is not finding people right now, so orders wait.',
};

const fr: AgentOrdersCopy = {
  title: 'Ordres permanents',
  note: 'Votre agent publie ce besoin en privé et sollicite des personnes chaque jour, dans vos limites. Il ne déplace pas d’argent.',
  add: 'Ajouter un ordre',
  newOrder: 'Nouvel ordre',
  find: 'Ce qu’il doit trouver',
  sell: 'Ce qu’il doit vendre',
  most: 'Le maximum pour un',
  side: 'Achat ou vente',
  sides: { buy: 'Achat', sell: 'Vente' },
  reaches: 'Comment cela vous parvient',
  kinds: { goods: 'Livré', in_person: 'En personne', remote: 'En ligne' },
  until: 'Jusqu’à',
  untilStop: 'Vous l’arrêtez',
  perDay: 'Personnes par jour',
  start: 'Lancer l’ordre',
  notNow: 'Pas maintenant',
  upTo: 'Jusqu’à {amount} chacun',
  usualPrice: 'À votre prix habituel',
  inCity: 'À {city}',
  untilDate: 'jusqu’au {date}',
  untilStopLine: 'jusqu’à ce que vous l’arrêtiez',
  askedToday: '{n} sollicités aujourd’hui',
  paused: 'En pause',
  done: 'Terminé',
  ended: 'Fini',
  needsLocation: 'Votre quartier manque',
  needsMoney: 'Solde insuffisant',
  askedTodayLabel: 'Sollicités aujourd’hui',
  thisWeek: 'Cette semaine',
  weekLine: '{asked} sollicités, {offers} offres',
  pause: 'Mettre en pause',
  resume: 'Reprendre',
  stop: 'Arrêter cet ordre',
  save: 'Enregistrer',
  failed: 'Cela n’a pas été enregistré. Réessayez.',
  resting: 'Votre agent ne cherche personne pour l’instant, les ordres attendent.',
};

const ar: AgentOrdersCopy = {
  title: 'الطلبات الدائمة',
  note: 'ينشر وكيلك هذا الطلب بشكل خاص ويسأل الناس عنه كل يوم ضمن حدودك. لا يحرك أي مال.',
  add: 'أضف طلبا',
  newOrder: 'طلب جديد',
  find: 'ما الذي يبحث عنه',
  sell: 'ما الذي يبيعه',
  most: 'الحد الأقصى للواحد',
  side: 'شراء أم بيع',
  sides: { buy: 'شراء', sell: 'بيع' },
  reaches: 'كيف يصلك',
  kinds: { goods: 'توصيل', in_person: 'وجها لوجه', remote: 'عبر الإنترنت' },
  until: 'حتى',
  untilStop: 'حتى توقفه',
  perDay: 'أشخاص في اليوم',
  start: 'ابدأ الطلب',
  notNow: 'ليس الآن',
  upTo: 'حتى {amount} للواحد',
  usualPrice: 'بسعرك المعتاد',
  inCity: 'في {city}',
  untilDate: 'حتى {date}',
  untilStopLine: 'حتى توقفه',
  askedToday: 'سُئل {n} اليوم',
  paused: 'متوقف مؤقتا',
  done: 'تم',
  ended: 'انتهى',
  needsLocation: 'يحتاج منطقتك',
  needsMoney: 'يحتاج رصيدا',
  askedTodayLabel: 'سُئلوا اليوم',
  thisWeek: 'هذا الأسبوع',
  weekLine: '{asked} سُئلوا، {offers} عروض',
  pause: 'إيقاف مؤقت',
  resume: 'استئناف',
  stop: 'أوقف هذا الطلب',
  save: 'حفظ',
  failed: 'لم يُحفظ. حاول مرة أخرى.',
  resting: 'وكيلك لا يبحث عن أحد الآن، فالطلبات تنتظر.',
};

const hi: AgentOrdersCopy = {
  title: 'स्थायी ऑर्डर',
  note: 'आपका एजेंट इसे निजी तौर पर पोस्ट करता है और आपकी सीमाओं के भीतर हर दिन लोगों से पूछता है। यह कोई पैसा नहीं हिलाता।',
  add: 'ऑर्डर जोड़ें',
  newOrder: 'नया ऑर्डर',
  find: 'इसे क्या ढूँढना है',
  sell: 'इसे क्या बेचना है',
  most: 'एक के लिए अधिकतम',
  side: 'खरीदना या बेचना',
  sides: { buy: 'खरीदना', sell: 'बेचना' },
  reaches: 'यह आप तक कैसे पहुँचे',
  kinds: { goods: 'डिलीवरी', in_person: 'आमने-सामने', remote: 'ऑनलाइन' },
  until: 'कब तक',
  untilStop: 'जब तक आप रोकें',
  perDay: 'रोज़ कितने लोग',
  start: 'ऑर्डर शुरू करें',
  notNow: 'अभी नहीं',
  upTo: 'हर एक {amount} तक',
  usualPrice: 'आपकी सामान्य कीमत पर',
  inCity: '{city} में',
  untilDate: '{date} तक',
  untilStopLine: 'जब तक आप रोकें',
  askedToday: 'आज {n} से पूछा',
  paused: 'रुका हुआ',
  done: 'पूरा',
  ended: 'समाप्त',
  needsLocation: 'आपका इलाका चाहिए',
  needsMoney: 'बैलेंस चाहिए',
  askedTodayLabel: 'आज पूछा गया',
  thisWeek: 'इस हफ़्ते',
  weekLine: '{asked} से पूछा, {offers} ऑफ़र',
  pause: 'रोकें',
  resume: 'फिर शुरू करें',
  stop: 'यह ऑर्डर बंद करें',
  save: 'सहेजें',
  failed: 'यह सहेजा नहीं गया। फिर कोशिश करें।',
  resting: 'आपका एजेंट अभी किसी को नहीं ढूँढ रहा, इसलिए ऑर्डर रुके हैं।',
};

const sw: AgentOrdersCopy = {
  title: 'Maagizo ya kudumu',
  note: 'Wakala wako huchapisha hitaji hili kwa faragha na huuliza watu kila siku, ndani ya mipaka yako. Hahamishi pesa.',
  add: 'Ongeza agizo',
  newOrder: 'Agizo jipya',
  find: 'Anachopaswa kutafuta',
  sell: 'Anachopaswa kuuza',
  most: 'Kiwango cha juu kwa kimoja',
  side: 'Kununua au kuuza',
  sides: { buy: 'Kununua', sell: 'Kuuza' },
  reaches: 'Kinavyokufikia',
  kinds: { goods: 'Huletwa', in_person: 'Ana kwa ana', remote: 'Mtandaoni' },
  until: 'Hadi',
  untilStop: 'Hadi ulisimamishe',
  perDay: 'Watu kwa siku',
  start: 'Anzisha agizo',
  notNow: 'Si sasa',
  upTo: 'Hadi {amount} kila kimoja',
  usualPrice: 'Kwa bei yako ya kawaida',
  inCity: 'Huko {city}',
  untilDate: 'hadi {date}',
  untilStopLine: 'hadi ulisimamishe',
  askedToday: '{n} wameulizwa leo',
  paused: 'Limesitishwa',
  done: 'Limekamilika',
  ended: 'Limeisha',
  needsLocation: 'Linahitaji eneo lako',
  needsMoney: 'Linahitaji pesa',
  askedTodayLabel: 'Walioulizwa leo',
  thisWeek: 'Wiki hii',
  weekLine: '{asked} wameulizwa, ofa {offers}',
  pause: 'Sitisha',
  resume: 'Endelea',
  stop: 'Simamisha agizo hili',
  save: 'Hifadhi',
  failed: 'Haikuhifadhiwa. Jaribu tena.',
  resting: 'Wakala wako hatafuti watu sasa, kwa hiyo maagizo yanasubiri.',
};

export const agentOrdersCopy: Record<Locale, AgentOrdersCopy> = { en, fr, ar, hi, sw };
