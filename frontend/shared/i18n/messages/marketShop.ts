/// The market as a shop (view 44): Buy and Sell, categories, photo cards and
/// the listing page.
export interface MarketShopCopy {
  title: string;
  heroTitle: string;
  heroBody: string;
  switchLabel: string;
  buy: string;
  sell: string;
  search: string;
  categoriesLabel: string;
  all: string;
  categories: Record<'design' | 'tech' | 'phones' | 'fashion' | 'food' | 'farm' | 'home' | 'lessons' | 'repairs' | 'rentals', string>;
  newOnKarwan: string;
  seeAll: string;
  results: string;
  protected: string;
  samplePhoto: string;
  usdc: string;
  deliversIn: string;
  deliversInOne: string;
  shipsIn: string;
  shipsInOne: string;
  readyIn: string;
  readyInOne: string;
  someone: string;
  verified: string;
  example: string;
  business: string;
  cantFind: string;
  cantFindBody: string;
  postNeed: string;
  dealDirect: string;
  yourRequests: string;
  yourOffers: string;
  nothingMatches: string;
  nothingBody: string;
  clear: string;
  listWhatYouSell: string;
  listBody: string;
  buyersNeed: string;
  fitsFirst: string;
  fits: string;
  upTo: string;
  neededBy: string;
  offersNone: string;
  offersOne: string;
  offersMany: string;
  noRequests: string;
  loadError: string;
  retry: string;
  listing: {
    protectedNote: string;
    delivery: string;
    inDays: string;
    inOneDay: string;
    howYouPay: string;
    onePayment: string;
    inParts: string;
    whatYouGet: string;
    howItWorks: string;
    stepPay: string;
    stepRemote: string;
    stepGoods: string;
    stepInPerson: string;
    stepRelease: string;
    order: string;
    message: string;
    seller: string;
  };
}

export const marketShopCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', MarketShopCopy> = {
  en: {
    title: 'Market',
    heroTitle: 'Buy and sell safely',
    heroBody: 'Pay in, and Karwan holds the money until you confirm you got what you paid for.',
    switchLabel: 'Buy or sell',
    buy: 'Buy',
    sell: 'Sell',
    search: 'What do you need?',
    categoriesLabel: 'Categories',
    all: 'All',
    categories: { design: 'Design', tech: 'Tech', phones: 'Phones', fashion: 'Fashion', food: 'Food', farm: 'Farm produce', home: 'Home', lessons: 'Lessons', repairs: 'Repairs', rentals: 'Rentals' },
    newOnKarwan: 'New on Karwan',
    seeAll: 'See all',
    results: 'Results',
    protected: 'Protected',
    samplePhoto: 'Sample photo',
    usdc: 'USDC',
    deliversIn: 'Delivers in {n} days',
    deliversInOne: 'Delivers in 1 day',
    shipsIn: 'Ships in {n} days',
    shipsInOne: 'Ships in 1 day',
    readyIn: 'Ready in {n} days',
    readyInOne: 'Ready in 1 day',
    someone: 'A Karwan seller',
    verified: 'Verified',
    example: 'Example',
    business: 'Business',
    cantFind: 'Can’t find it?',
    cantFindBody: 'Say what you need and sellers send you offers.',
    postNeed: 'Post what you need',
    dealDirect: 'More ways to start',
    yourRequests: 'Your requests',
    yourOffers: 'Your offers',
    nothingMatches: 'Nothing matches yet',
    nothingBody: 'Try other words, or say what you need and sellers send you offers.',
    clear: 'Clear search',
    listWhatYouSell: 'List what you sell',
    listBody: 'Photos, a price, and how fast you deliver. Takes a minute.',
    buyersNeed: 'What buyers need',
    fitsFirst: 'Fits you first',
    fits: 'Fits what you sell',
    upTo: 'Up to {amount} USDC',
    neededBy: 'Needed by {date}',
    offersNone: 'No offers yet',
    offersOne: '1 offer so far',
    offersMany: '{n} offers so far',
    noRequests: 'No requests are open right now.',
    loadError: 'The market could not load.',
    retry: 'Try again',
    listing: {
      protectedNote: 'Protected. Karwan holds your money until you confirm you got it, and our agents check it against what you agreed.',
      delivery: 'Delivery',
      inDays: 'In {n} days',
      inOneDay: 'In 1 day',
      howYouPay: 'How you pay',
      onePayment: 'One payment',
      inParts: 'In {n} parts',
      whatYouGet: 'What you get',
      howItWorks: 'How it works',
      stepPay: 'You order and pay in. Karwan holds the money.',
      stepRemote: '{name} does the work and sends it to you.',
      stepGoods: '{name} sends it to you.',
      stepInPerson: '{name} meets you to hand it over.',
      stepRelease: 'You check it, then release the money to {name}.',
      order: 'Order · {amount} USDC',
      message: 'Message',
      seller: 'the seller',
    },
  },
  fr: {
    title: 'Marché',
    heroTitle: 'Achetez et vendez en sécurité',
    heroBody: 'Vous payez, et Karwan garde l’argent jusqu’à ce que vous confirmiez avoir reçu ce que vous avez payé.',
    switchLabel: 'Acheter ou vendre',
    buy: 'Acheter',
    sell: 'Vendre',
    search: 'De quoi avez-vous besoin ?',
    categoriesLabel: 'Catégories',
    all: 'Tout',
    categories: { design: 'Design', tech: 'Tech', phones: 'Téléphones', fashion: 'Mode', food: 'Cuisine', farm: 'Produits agricoles', home: 'Maison', lessons: 'Cours', repairs: 'Réparations', rentals: 'Locations' },
    newOnKarwan: 'Nouveau sur Karwan',
    seeAll: 'Tout voir',
    results: 'Résultats',
    protected: 'Protégé',
    samplePhoto: 'Photo d’exemple',
    usdc: 'USDC',
    deliversIn: 'Livré en {n} jours',
    deliversInOne: 'Livré en 1 jour',
    shipsIn: 'Expédié en {n} jours',
    shipsInOne: 'Expédié en 1 jour',
    readyIn: 'Prêt en {n} jours',
    readyInOne: 'Prêt en 1 jour',
    someone: 'Un vendeur Karwan',
    verified: 'Vérifié',
    example: 'Exemple',
    business: 'Entreprise',
    cantFind: 'Vous ne trouvez pas ?',
    cantFindBody: 'Dites ce qu’il vous faut et les vendeurs vous font des offres.',
    postNeed: 'Publier ce qu’il vous faut',
    dealDirect: 'D’autres façons de commencer',
    yourRequests: 'Vos demandes',
    yourOffers: 'Vos offres',
    nothingMatches: 'Rien ne correspond pour l’instant',
    nothingBody: 'Essayez d’autres mots, ou dites ce qu’il vous faut et les vendeurs vous font des offres.',
    clear: 'Effacer la recherche',
    listWhatYouSell: 'Proposer ce que vous vendez',
    listBody: 'Des photos, un prix et votre délai de livraison. Une minute suffit.',
    buyersNeed: 'Ce que cherchent les acheteurs',
    fitsFirst: 'Ce qui vous correspond d’abord',
    fits: 'Correspond à ce que vous vendez',
    upTo: 'Jusqu’à {amount} USDC',
    neededBy: 'Pour le {date}',
    offersNone: 'Pas encore d’offre',
    offersOne: '1 offre pour l’instant',
    offersMany: '{n} offres pour l’instant',
    noRequests: 'Aucune demande ouverte pour le moment.',
    loadError: 'Le marché n’a pas pu se charger.',
    retry: 'Réessayer',
    listing: {
      protectedNote: 'Protégé. Karwan garde votre argent jusqu’à ce que vous confirmiez l’avoir reçu, et nos agents le comparent à ce qui a été convenu.',
      delivery: 'Livraison',
      inDays: 'En {n} jours',
      inOneDay: 'En 1 jour',
      howYouPay: 'Comment vous payez',
      onePayment: 'Un seul paiement',
      inParts: 'En {n} fois',
      whatYouGet: 'Ce que vous recevez',
      howItWorks: 'Comment ça marche',
      stepPay: 'Vous commandez et payez. Karwan garde l’argent.',
      stepRemote: '{name} fait le travail et vous l’envoie.',
      stepGoods: '{name} vous l’envoie.',
      stepInPerson: '{name} vous retrouve pour vous le remettre.',
      stepRelease: 'Vous vérifiez, puis vous versez l’argent à {name}.',
      order: 'Commander · {amount} USDC',
      message: 'Message',
      seller: 'le vendeur',
    },
  },
  ar: {
    title: 'السوق',
    heroTitle: 'اشترِ وبِع بأمان',
    heroBody: 'تدفع، ويحتفظ Karwan بالمال حتى تؤكد أنك استلمت ما دفعت ثمنه.',
    switchLabel: 'شراء أو بيع',
    buy: 'شراء',
    sell: 'بيع',
    search: 'ماذا تحتاج؟',
    categoriesLabel: 'الفئات',
    all: 'الكل',
    categories: { design: 'تصميم', tech: 'تقنية', phones: 'هواتف', fashion: 'أزياء', food: 'طعام', farm: 'منتجات زراعية', home: 'المنزل', lessons: 'دروس', repairs: 'تصليحات', rentals: 'إيجارات' },
    newOnKarwan: 'جديد على Karwan',
    seeAll: 'عرض الكل',
    results: 'النتائج',
    protected: 'محمي',
    samplePhoto: 'صورة توضيحية',
    usdc: 'USDC',
    deliversIn: 'يُسلَّم خلال {n} أيام',
    deliversInOne: 'يُسلَّم خلال يوم واحد',
    shipsIn: 'يُشحن خلال {n} أيام',
    shipsInOne: 'يُشحن خلال يوم واحد',
    readyIn: 'جاهز خلال {n} أيام',
    readyInOne: 'جاهز خلال يوم واحد',
    someone: 'بائع على Karwan',
    verified: 'موثَّق',
    example: 'مثال',
    business: 'شركة',
    cantFind: 'لم تجده؟',
    cantFindBody: 'قل ما تحتاجه، وسيرسل لك البائعون عروضهم.',
    postNeed: 'انشر ما تحتاجه',
    dealDirect: 'طرق أخرى للبدء',
    yourRequests: 'طلباتك',
    yourOffers: 'عروضك',
    nothingMatches: 'لا شيء يطابق بعد',
    nothingBody: 'جرّب كلمات أخرى، أو قل ما تحتاجه وسيرسل لك البائعون عروضهم.',
    clear: 'مسح البحث',
    listWhatYouSell: 'اعرض ما تبيعه',
    listBody: 'صور وسعر ومدة التسليم. يستغرق دقيقة.',
    buyersNeed: 'ما يحتاجه المشترون',
    fitsFirst: 'ما يناسبك أولًا',
    fits: 'يناسب ما تبيعه',
    upTo: 'حتى {amount} USDC',
    neededBy: 'مطلوب بحلول {date}',
    offersNone: 'لا عروض بعد',
    offersOne: 'عرض واحد حتى الآن',
    offersMany: '{n} عروض حتى الآن',
    noRequests: 'لا توجد طلبات مفتوحة الآن.',
    loadError: 'تعذّر تحميل السوق.',
    retry: 'حاول مرة أخرى',
    listing: {
      protectedNote: 'محمي. يحتفظ Karwan بمالك حتى تؤكد أنك استلمته، ويقارنه وكلاؤنا بما اتفقتم عليه.',
      delivery: 'التسليم',
      inDays: 'خلال {n} أيام',
      inOneDay: 'خلال يوم واحد',
      howYouPay: 'طريقة الدفع',
      onePayment: 'دفعة واحدة',
      inParts: 'على {n} دفعات',
      whatYouGet: 'ما الذي تحصل عليه',
      howItWorks: 'كيف يعمل',
      stepPay: 'تطلب وتدفع. يحتفظ Karwan بالمال.',
      stepRemote: '{name} ينجز العمل ويرسله إليك.',
      stepGoods: '{name} يرسله إليك.',
      stepInPerson: '{name} يلتقي بك لتسليمه.',
      stepRelease: 'تتحقق منه، ثم تحرّر المال إلى {name}.',
      order: 'اطلب · {amount} USDC',
      message: 'رسالة',
      seller: 'البائع',
    },
  },
  hi: {
    title: 'बाज़ार',
    heroTitle: 'सुरक्षित खरीदें और बेचें',
    heroBody: 'आप भुगतान करते हैं, और Karwan पैसा तब तक रखता है जब तक आप पुष्टि न करें कि आपको वह मिल गया जिसका भुगतान किया।',
    switchLabel: 'खरीदें या बेचें',
    buy: 'खरीदें',
    sell: 'बेचें',
    search: 'आपको क्या चाहिए?',
    categoriesLabel: 'श्रेणियाँ',
    all: 'सभी',
    categories: { design: 'डिज़ाइन', tech: 'टेक', phones: 'फ़ोन', fashion: 'फ़ैशन', food: 'खाना', farm: 'खेती की उपज', home: 'घर', lessons: 'पढ़ाई', repairs: 'मरम्मत', rentals: 'किराया' },
    newOnKarwan: 'Karwan पर नया',
    seeAll: 'सभी देखें',
    results: 'नतीजे',
    protected: 'सुरक्षित',
    samplePhoto: 'नमूना फ़ोटो',
    usdc: 'USDC',
    deliversIn: '{n} दिन में डिलीवरी',
    deliversInOne: '1 दिन में डिलीवरी',
    shipsIn: '{n} दिन में भेजा जाएगा',
    shipsInOne: '1 दिन में भेजा जाएगा',
    readyIn: '{n} दिन में तैयार',
    readyInOne: '1 दिन में तैयार',
    someone: 'Karwan का एक विक्रेता',
    verified: 'सत्यापित',
    example: 'उदाहरण',
    business: 'व्यवसाय',
    cantFind: 'नहीं मिला?',
    cantFindBody: 'बताइए आपको क्या चाहिए, विक्रेता आपको ऑफ़र भेजेंगे।',
    postNeed: 'अपनी ज़रूरत पोस्ट करें',
    dealDirect: 'शुरू करने के और तरीके',
    yourRequests: 'आपके अनुरोध',
    yourOffers: 'आपके ऑफ़र',
    nothingMatches: 'अभी कुछ मेल नहीं खाता',
    nothingBody: 'दूसरे शब्द आज़माएँ, या बताइए आपको क्या चाहिए और विक्रेता आपको ऑफ़र भेजेंगे।',
    clear: 'खोज साफ़ करें',
    listWhatYouSell: 'जो बेचते हैं उसे लिस्ट करें',
    listBody: 'फ़ोटो, कीमत, और आप कितनी जल्दी देते हैं। बस एक मिनट।',
    buyersNeed: 'खरीदारों को क्या चाहिए',
    fitsFirst: 'जो आपसे मेल खाए, वह पहले',
    fits: 'आपकी बिक्री से मेल खाता है',
    upTo: '{amount} USDC तक',
    neededBy: '{date} तक चाहिए',
    offersNone: 'अभी कोई ऑफ़र नहीं',
    offersOne: 'अब तक 1 ऑफ़र',
    offersMany: 'अब तक {n} ऑफ़र',
    noRequests: 'अभी कोई अनुरोध खुला नहीं है।',
    loadError: 'बाज़ार लोड नहीं हो सका।',
    retry: 'फिर से कोशिश करें',
    listing: {
      protectedNote: 'सुरक्षित। Karwan आपका पैसा तब तक रखता है जब तक आप पुष्टि न करें कि आपको मिल गया, और हमारे एजेंट उसे तय बातों से मिलाकर देखते हैं।',
      delivery: 'डिलीवरी',
      inDays: '{n} दिन में',
      inOneDay: '1 दिन में',
      howYouPay: 'आप कैसे भुगतान करते हैं',
      onePayment: 'एक बार में भुगतान',
      inParts: '{n} किस्तों में',
      whatYouGet: 'आपको क्या मिलता है',
      howItWorks: 'यह कैसे काम करता है',
      stepPay: 'आप ऑर्डर करते और भुगतान करते हैं। Karwan पैसा रखता है।',
      stepRemote: '{name} काम करके आपको भेजते हैं।',
      stepGoods: '{name} आपको भेजते हैं।',
      stepInPerson: '{name} आपसे मिलकर सौंपते हैं।',
      stepRelease: 'आप जाँचते हैं, फिर पैसा {name} को जारी करते हैं।',
      order: 'ऑर्डर करें · {amount} USDC',
      message: 'संदेश',
      seller: 'विक्रेता',
    },
  },
  sw: {
    title: 'Soko',
    heroTitle: 'Nunua na uuze kwa usalama',
    heroBody: 'Unalipa, na Karwan inashikilia pesa hadi uthibitishe umepata ulicholipia.',
    switchLabel: 'Nunua au uza',
    buy: 'Nunua',
    sell: 'Uza',
    search: 'Unahitaji nini?',
    categoriesLabel: 'Aina',
    all: 'Zote',
    categories: { design: 'Ubunifu', tech: 'Teknolojia', phones: 'Simu', fashion: 'Mitindo', food: 'Chakula', farm: 'Mazao ya shamba', home: 'Nyumbani', lessons: 'Masomo', repairs: 'Matengenezo', rentals: 'Kukodisha' },
    newOnKarwan: 'Mpya kwenye Karwan',
    seeAll: 'Ona zote',
    results: 'Matokeo',
    protected: 'Imelindwa',
    samplePhoto: 'Picha ya mfano',
    usdc: 'USDC',
    deliversIn: 'Inafika ndani ya siku {n}',
    deliversInOne: 'Inafika ndani ya siku 1',
    shipsIn: 'Inatumwa ndani ya siku {n}',
    shipsInOne: 'Inatumwa ndani ya siku 1',
    readyIn: 'Tayari ndani ya siku {n}',
    readyInOne: 'Tayari ndani ya siku 1',
    someone: 'Muuzaji wa Karwan',
    verified: 'Amethibitishwa',
    example: 'Mfano',
    business: 'Biashara',
    cantFind: 'Hukipati?',
    cantFindBody: 'Sema unachohitaji na wauzaji watakutumia ofa.',
    postNeed: 'Weka unachohitaji',
    dealDirect: 'Njia nyingine za kuanza',
    yourRequests: 'Maombi yako',
    yourOffers: 'Ofa zako',
    nothingMatches: 'Hakuna kinacholingana bado',
    nothingBody: 'Jaribu maneno mengine, au sema unachohitaji na wauzaji watakutumia ofa.',
    clear: 'Futa utafutaji',
    listWhatYouSell: 'Weka unachouza',
    listBody: 'Picha, bei, na muda wa kufikisha. Inachukua dakika moja.',
    buyersNeed: 'Wanunuzi wanahitaji nini',
    fitsFirst: 'Vinavyokufaa kwanza',
    fits: 'Inalingana na unachouza',
    upTo: 'Hadi USDC {amount}',
    neededBy: 'Inahitajika kufikia {date}',
    offersNone: 'Hakuna ofa bado',
    offersOne: 'Ofa 1 hadi sasa',
    offersMany: 'Ofa {n} hadi sasa',
    noRequests: 'Hakuna maombi yaliyo wazi sasa.',
    loadError: 'Soko halikuweza kupakia.',
    retry: 'Jaribu tena',
    listing: {
      protectedNote: 'Imelindwa. Karwan inashikilia pesa zako hadi uthibitishe umepokea, na mawakala wetu wanakilinganisha na mlichokubaliana.',
      delivery: 'Kufikishwa',
      inDays: 'Ndani ya siku {n}',
      inOneDay: 'Ndani ya siku 1',
      howYouPay: 'Unavyolipa',
      onePayment: 'Malipo moja',
      inParts: 'Kwa awamu {n}',
      whatYouGet: 'Unachopata',
      howItWorks: 'Inavyofanya kazi',
      stepPay: 'Unaagiza na kulipa. Karwan inashikilia pesa.',
      stepRemote: '{name} anafanya kazi na kukutumia.',
      stepGoods: '{name} anakutumia.',
      stepInPerson: '{name} anakutana nawe kukukabidhi.',
      stepRelease: 'Unakagua, kisha unamlipa {name} pesa.',
      order: 'Agiza · USDC {amount}',
      message: 'Ujumbe',
      seller: 'muuzaji',
    },
  },
};
