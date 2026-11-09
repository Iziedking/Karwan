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
  },
};
