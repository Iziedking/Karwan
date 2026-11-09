/// The market as a shop (view 44): Buy and Sell, categories, photo cards and
/// the listing page.
export interface MarketShopCopy {
  title: string;
  heroTitle: string;
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
  /// A request matched or agreed stays on the market, marked (view 53).
  requestStates: { negotiating: string; agreed: string };
  /// Who can see what you post (view 53).
  whoCanSee: {
    label: string;
    market: string;
    marketRequest: string;
    marketOffer: string;
    agents: string;
    agentsRequest: string;
    agentsOffer: string;
    link: string;
    linkRequest: string;
    linkOffer: string;
    linkCta: string;
  };
  usdc: string;
  someone: string;
  verified: string;
  example: string;
  business: string;
  cantFind: string;
  postNeed: string;
  dealDirect: string;
  yourRequests: string;
  yourOffers: string;
  /// Under Your offers on the Sell side: how many are on the market now.
  offersLiveOne: string;
  offersLiveMany: string;
  nothingMatches: string;
  nothingBody: string;
  clear: string;
  listWhatYouSell: string;
  listBody: string;
  buyersNeed: string;
  fitsFirst: string;
  fits: string;
  upTo: string;
  /// View 73: a bargaining request's budget as a range, for sellers.
  budgetRange: string;
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
    /// The seller card's link to their record (view 48).
    record: string;
    seller: string;
  };
}

export const marketShopCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', MarketShopCopy> = {
  en: {
    title: 'Market',
    heroTitle: 'Buy and sell safely',
    switchLabel: 'Buy or sell',
    buy: 'Buy',
    sell: 'Sell',
    search: 'What do you need?',
    categoriesLabel: 'Categories',
    all: 'All',
    categories: { design: 'Design', tech: 'Tech', phones: 'Phones and electronics', fashion: 'Fashion', food: 'Food', farm: 'Farm produce', home: 'Home', lessons: 'Lessons', repairs: 'Repairs', rentals: 'Rentals' },
    newOnKarwan: 'New on Karwan',
    seeAll: 'See all',
    results: 'Results',
    protected: 'Protected',
    samplePhoto: 'Sample photo',
    requestStates: { negotiating: 'In negotiation', agreed: 'Agreed' },
    whoCanSee: {
      label: 'Who can see it',
      market: 'Everyone on the market',
      marketRequest: 'Listed on the market. Anyone can see it and every offer on it.',
      marketOffer: 'Listed on the market for anyone to find.',
      agents: 'Private: only agents',
      agentsRequest: 'Never on the market. Seller agents still find it, and only the sellers who offer see it.',
      agentsOffer: 'Never on the market. Buyer agents still find it, and anyone you send the link can open it.',
      link: 'Just one person',
      linkRequest: 'You already agreed with someone. Start a deal with them; nothing is posted.',
      linkOffer: 'You already agreed with someone. Send them your deal link; nothing is posted.',
      linkCta: 'Start a deal with them',
    },
    usdc: 'USDC',
    someone: 'A Karwan seller',
    verified: 'Verified',
    example: 'Example',
    business: 'Business',
    cantFind: 'Can’t find it?',
    postNeed: 'Post what you need',
    dealDirect: 'More ways to start',
    yourRequests: 'Your requests',
    yourOffers: 'Your offers',
    offersLiveOne: '1 live in the market',
    offersLiveMany: '{n} live in the market',
    nothingMatches: 'Nothing matches yet',
    nothingBody: 'Try other words, or say what you need and sellers send you offers.',
    clear: 'Clear search',
    listWhatYouSell: 'List what you sell',
    listBody: 'Photos, a price, and how fast you deliver. Takes a minute.',
    buyersNeed: 'What buyers need',
    fitsFirst: 'Fits you first',
    fits: 'Fits what you sell',
    upTo: 'Up to {amount}',
    budgetRange: 'Budget {low} to {high}',
    neededBy: 'Needed by {date}',
    offersNone: 'No offers yet',
    offersOne: '1 offer so far',
    offersMany: '{n} offers so far',
    noRequests: 'No requests are open right now.',
    loadError: 'The market could not load.',
    retry: 'Try again',
    listing: {
      protectedNote: "Payment is held in escrow. Review the delivery, release and refund terms before paying.",
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
      stepRelease: "Review delivery from {name}. Payment follows the agreed release rules.",
      order: "Review order · {amount} USDC",
      message: 'Message {name}',
      record: 'Record',
      seller: 'the seller',
    },
  },
  fr: {
    title: 'Marché',
    heroTitle: 'Achetez et vendez en sécurité',
    switchLabel: 'Acheter ou vendre',
    buy: 'Acheter',
    sell: 'Vendre',
    search: 'De quoi avez-vous besoin ?',
    categoriesLabel: 'Catégories',
    all: 'Tout',
    categories: { design: 'Design', tech: 'Tech', phones: 'Téléphones et électronique', fashion: 'Mode', food: 'Cuisine', farm: 'Produits agricoles', home: 'Maison', lessons: 'Cours', repairs: 'Réparations', rentals: 'Locations' },
    newOnKarwan: 'Nouveau sur Karwan',
    seeAll: 'Tout voir',
    results: 'Résultats',
    protected: 'Protégé',
    samplePhoto: 'Photo d’exemple',
    requestStates: { negotiating: 'En négociation', agreed: 'Accord conclu' },
    whoCanSee: {
      label: 'Qui peut le voir',
      market: 'Tout le monde sur le marché',
      marketRequest: 'Sur le marché. Tout le monde voit la demande et chaque offre reçue.',
      marketOffer: 'Sur le marché, visible par tous.',
      agents: 'Privé : agents seulement',
      agentsRequest: 'Jamais sur le marché. Les agents vendeurs la trouvent, et seuls les vendeurs qui font une offre la voient.',
      agentsOffer: 'Jamais sur le marché. Les agents acheteurs la trouvent, et toute personne à qui vous envoyez le lien peut l’ouvrir.',
      link: 'Une seule personne',
      linkRequest: 'Vous êtes déjà d’accord avec quelqu’un. Lancez un accord avec cette personne ; rien n’est publié.',
      linkOffer: 'Vous êtes déjà d’accord avec quelqu’un. Envoyez-lui votre lien d’accord ; rien n’est publié.',
      linkCta: 'Lancer un accord avec elle',
    },
    usdc: 'USDC',
    someone: 'Un vendeur Karwan',
    verified: 'Vérifié',
    example: 'Exemple',
    business: 'Entreprise',
    cantFind: 'Vous ne trouvez pas ?',
    postNeed: 'Publier ce qu’il vous faut',
    dealDirect: 'D’autres façons de commencer',
    yourRequests: 'Vos demandes',
    yourOffers: 'Vos offres',
    offersLiveOne: '1 en ligne sur le marché',
    offersLiveMany: '{n} en ligne sur le marché',
    nothingMatches: 'Rien ne correspond pour l’instant',
    nothingBody: 'Essayez d’autres mots, ou dites ce qu’il vous faut et les vendeurs vous font des offres.',
    clear: 'Effacer la recherche',
    listWhatYouSell: 'Proposer ce que vous vendez',
    listBody: 'Des photos, un prix et votre délai de livraison. Une minute suffit.',
    buyersNeed: 'Ce que cherchent les acheteurs',
    fitsFirst: 'Ce qui vous correspond d’abord',
    fits: 'Correspond à ce que vous vendez',
    upTo: 'Jusqu’à {amount}',
    budgetRange: 'Budget de {low} à {high}',
    neededBy: 'Pour le {date}',
    offersNone: 'Pas encore d’offre',
    offersOne: '1 offre pour l’instant',
    offersMany: '{n} offres pour l’instant',
    noRequests: 'Aucune demande ouverte pour le moment.',
    loadError: 'Le marché n’a pas pu se charger.',
    retry: 'Réessayer',
    listing: {
      protectedNote: "Le paiement est sous séquestre. Vérifiez les conditions de livraison, de versement et de remboursement avant de payer.",
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
      stepRelease: "Vérifiez la livraison de {name}. Le paiement suit les règles de versement convenues.",
      order: "Vérifier la commande · {amount} USDC",
      message: 'Écrire à {name}',
      record: 'Historique',
      seller: 'le vendeur',
    },
  },
  ar: {
    title: 'السوق',
    heroTitle: 'اشترِ وبِع بأمان',
    switchLabel: 'شراء أو بيع',
    buy: 'شراء',
    sell: 'بيع',
    search: 'ماذا تحتاج؟',
    categoriesLabel: 'الفئات',
    all: 'الكل',
    categories: { design: 'تصميم', tech: 'تقنية', phones: 'هواتف وإلكترونيات', fashion: 'أزياء', food: 'طعام', farm: 'منتجات زراعية', home: 'المنزل', lessons: 'دروس', repairs: 'تصليحات', rentals: 'إيجارات' },
    newOnKarwan: 'جديد على Karwan',
    seeAll: 'عرض الكل',
    results: 'النتائج',
    protected: 'محمي',
    samplePhoto: 'صورة توضيحية',
    requestStates: { negotiating: 'قيد التفاوض', agreed: 'تم الاتفاق' },
    whoCanSee: {
      label: 'من يمكنه رؤيته',
      market: 'الجميع في السوق',
      marketRequest: 'معروض في السوق. يمكن لأي شخص رؤيته ورؤية كل عرض عليه.',
      marketOffer: 'معروض في السوق ليجده أي شخص.',
      agents: 'خاص: للوكلاء فقط',
      agentsRequest: 'لا يظهر في السوق أبدًا. يجده وكلاء البائعين، ولا يراه إلا البائعون الذين يقدّمون عروضًا.',
      agentsOffer: 'لا يظهر في السوق أبدًا. يجده وكلاء المشترين، ويمكن لأي شخص ترسل له الرابط فتحه.',
      link: 'شخص واحد فقط',
      linkRequest: 'اتفقت مع شخص بالفعل. ابدأ صفقة معه؛ لا يُنشر شيء.',
      linkOffer: 'اتفقت مع شخص بالفعل. أرسل له رابط صفقتك؛ لا يُنشر شيء.',
      linkCta: 'ابدأ صفقة معه',
    },
    usdc: 'USDC',
    someone: 'بائع على Karwan',
    verified: 'موثَّق',
    example: 'مثال',
    business: 'شركة',
    cantFind: 'لم تجده؟',
    postNeed: 'انشر ما تحتاجه',
    dealDirect: 'طرق أخرى للبدء',
    yourRequests: 'طلباتك',
    yourOffers: 'عروضك',
    offersLiveOne: 'عرض واحد معروض في السوق',
    offersLiveMany: '{n} معروضة في السوق',
    nothingMatches: 'لا شيء يطابق بعد',
    nothingBody: 'جرّب كلمات أخرى، أو قل ما تحتاجه وسيرسل لك البائعون عروضهم.',
    clear: 'مسح البحث',
    listWhatYouSell: 'اعرض ما تبيعه',
    listBody: 'صور وسعر ومدة التسليم. يستغرق دقيقة.',
    buyersNeed: 'ما يحتاجه المشترون',
    fitsFirst: 'ما يناسبك أولًا',
    fits: 'يناسب ما تبيعه',
    upTo: 'حتى {amount}',
    budgetRange: 'الميزانية من {low} إلى {high}',
    neededBy: 'مطلوب بحلول {date}',
    offersNone: 'لا عروض بعد',
    offersOne: 'عرض واحد حتى الآن',
    offersMany: '{n} عروض حتى الآن',
    noRequests: 'لا توجد طلبات مفتوحة الآن.',
    loadError: 'تعذّر تحميل السوق.',
    retry: 'حاول مرة أخرى',
    listing: {
      protectedNote: "يُحفظ المبلغ في الضمان. راجع شروط التسليم والصرف والاسترداد قبل الدفع.",
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
      stepRelease: "راجع تسليم {name}. يتم الدفع وفق قواعد الصرف المتفق عليها.",
      order: "راجع الطلب · {amount} USDC",
      message: 'راسل {name}',
      record: 'السجل',
      seller: 'البائع',
    },
  },
  hi: {
    title: 'बाज़ार',
    heroTitle: 'सुरक्षित खरीदें और बेचें',
    switchLabel: 'खरीदें या बेचें',
    buy: 'खरीदें',
    sell: 'बेचें',
    search: 'आपको क्या चाहिए?',
    categoriesLabel: 'श्रेणियाँ',
    all: 'सभी',
    categories: { design: 'डिज़ाइन', tech: 'टेक', phones: 'फ़ोन और इलेक्ट्रॉनिक्स', fashion: 'फ़ैशन', food: 'खाना', farm: 'खेती की उपज', home: 'घर', lessons: 'पढ़ाई', repairs: 'मरम्मत', rentals: 'किराया' },
    newOnKarwan: 'Karwan पर नया',
    seeAll: 'सभी देखें',
    results: 'नतीजे',
    protected: 'सुरक्षित',
    samplePhoto: 'नमूना फ़ोटो',
    requestStates: { negotiating: 'बातचीत में', agreed: 'सहमति हो गई' },
    whoCanSee: {
      label: 'इसे कौन देख सकता है',
      market: 'बाज़ार में सभी',
      marketRequest: 'बाज़ार में दिखता है। कोई भी इसे और इस पर हर ऑफ़र देख सकता है।',
      marketOffer: 'बाज़ार में दिखता है, कोई भी ढूँढ सकता है।',
      agents: 'निजी: केवल एजेंट',
      agentsRequest: 'कभी बाज़ार में नहीं। विक्रेता एजेंट इसे ढूँढते हैं, और केवल ऑफ़र देने वाले विक्रेता इसे देखते हैं।',
      agentsOffer: 'कभी बाज़ार में नहीं। खरीदार एजेंट इसे ढूँढते हैं, और जिसे आप लिंक भेजें वह इसे खोल सकता है।',
      link: 'सिर्फ़ एक व्यक्ति',
      linkRequest: 'आप किसी से पहले ही सहमत हैं। उनके साथ सौदा शुरू करें; कुछ भी पोस्ट नहीं होता।',
      linkOffer: 'आप किसी से पहले ही सहमत हैं। उन्हें अपना सौदा लिंक भेजें; कुछ भी पोस्ट नहीं होता।',
      linkCta: 'उनके साथ सौदा शुरू करें',
    },
    usdc: 'USDC',
    someone: 'Karwan का एक विक्रेता',
    verified: 'सत्यापित',
    example: 'उदाहरण',
    business: 'व्यवसाय',
    cantFind: 'नहीं मिला?',
    postNeed: 'अपनी ज़रूरत पोस्ट करें',
    dealDirect: 'शुरू करने के और तरीके',
    yourRequests: 'आपके अनुरोध',
    yourOffers: 'आपके ऑफ़र',
    offersLiveOne: 'बाज़ार में 1 चालू',
    offersLiveMany: 'बाज़ार में {n} चालू',
    nothingMatches: 'अभी कुछ मेल नहीं खाता',
    nothingBody: 'दूसरे शब्द आज़माएँ, या बताइए आपको क्या चाहिए और विक्रेता आपको ऑफ़र भेजेंगे।',
    clear: 'खोज साफ़ करें',
    listWhatYouSell: 'जो बेचते हैं उसे लिस्ट करें',
    listBody: 'फ़ोटो, कीमत, और आप कितनी जल्दी देते हैं। बस एक मिनट।',
    buyersNeed: 'खरीदारों को क्या चाहिए',
    fitsFirst: 'जो आपसे मेल खाए, वह पहले',
    fits: 'आपकी बिक्री से मेल खाता है',
    upTo: '{amount} तक',
    budgetRange: 'बजट {low} से {high}',
    neededBy: '{date} तक चाहिए',
    offersNone: 'अभी कोई ऑफ़र नहीं',
    offersOne: 'अब तक 1 ऑफ़र',
    offersMany: 'अब तक {n} ऑफ़र',
    noRequests: 'अभी कोई अनुरोध खुला नहीं है।',
    loadError: 'बाज़ार लोड नहीं हो सका।',
    retry: 'फिर से कोशिश करें',
    listing: {
      protectedNote: "भुगतान एस्क्रो में रखा जाता है। भुगतान से पहले डिलीवरी, भुगतान जारी करने और वापसी की शर्तें पढ़ें।",
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
      stepRelease: "{name} की डिलीवरी की समीक्षा करें। भुगतान तय नियमों के अनुसार जारी होता है।",
      order: "ऑर्डर देखें · {amount} USDC",
      message: '{name} को संदेश भेजें',
      record: 'रिकॉर्ड',
      seller: 'विक्रेता',
    },
  },
  sw: {
    title: 'Soko',
    heroTitle: 'Nunua na uuze kwa usalama',
    switchLabel: 'Nunua au uza',
    buy: 'Nunua',
    sell: 'Uza',
    search: 'Unahitaji nini?',
    categoriesLabel: 'Aina',
    all: 'Zote',
    categories: { design: 'Ubunifu', tech: 'Teknolojia', phones: 'Simu na vifaa vya kielektroniki', fashion: 'Mitindo', food: 'Chakula', farm: 'Mazao ya shamba', home: 'Nyumbani', lessons: 'Masomo', repairs: 'Matengenezo', rentals: 'Kukodisha' },
    newOnKarwan: 'Mpya kwenye Karwan',
    seeAll: 'Ona zote',
    results: 'Matokeo',
    protected: 'Imelindwa',
    samplePhoto: 'Picha ya mfano',
    requestStates: { negotiating: 'Kwenye mazungumzo', agreed: 'Imekubaliwa' },
    whoCanSee: {
      label: 'Nani anaweza kuona',
      market: 'Kila mtu sokoni',
      marketRequest: 'Iko sokoni. Mtu yeyote anaiona pamoja na kila ofa juu yake.',
      marketOffer: 'Iko sokoni ili mtu yeyote aipate.',
      agents: 'Binafsi: mawakala tu',
      agentsRequest: 'Haiwi sokoni kamwe. Mawakala wa wauzaji wanaipata, na wauzaji wanaotoa ofa tu ndio wanaiona.',
      agentsOffer: 'Haiwi sokoni kamwe. Mawakala wa wanunuzi wanaipata, na yeyote utakayemtumia kiungo anaweza kuifungua.',
      link: 'Mtu mmoja tu',
      linkRequest: 'Tayari mmekubaliana na mtu. Anzisha mpango naye; hakuna kinachowekwa.',
      linkOffer: 'Tayari mmekubaliana na mtu. Mtumie kiungo chako cha mpango; hakuna kinachowekwa.',
      linkCta: 'Anzisha mpango naye',
    },
    usdc: 'USDC',
    someone: 'Muuzaji wa Karwan',
    verified: 'Amethibitishwa',
    example: 'Mfano',
    business: 'Biashara',
    cantFind: 'Hukipati?',
    postNeed: 'Weka unachohitaji',
    dealDirect: 'Njia nyingine za kuanza',
    yourRequests: 'Maombi yako',
    yourOffers: 'Ofa zako',
    offersLiveOne: '1 iko sokoni',
    offersLiveMany: '{n} ziko sokoni',
    nothingMatches: 'Hakuna kinacholingana bado',
    nothingBody: 'Jaribu maneno mengine, au sema unachohitaji na wauzaji watakutumia ofa.',
    clear: 'Futa utafutaji',
    listWhatYouSell: 'Weka unachouza',
    listBody: 'Picha, bei, na muda wa kufikisha. Inachukua dakika moja.',
    buyersNeed: 'Wanunuzi wanahitaji nini',
    fitsFirst: 'Vinavyokufaa kwanza',
    fits: 'Inalingana na unachouza',
    upTo: 'Hadi {amount}',
    budgetRange: 'Bajeti {low} hadi {high}',
    neededBy: 'Inahitajika kufikia {date}',
    offersNone: 'Hakuna ofa bado',
    offersOne: 'Ofa 1 hadi sasa',
    offersMany: 'Ofa {n} hadi sasa',
    noRequests: 'Hakuna maombi yaliyo wazi sasa.',
    loadError: 'Soko halikuweza kupakia.',
    retry: 'Jaribu tena',
    listing: {
      protectedNote: "Malipo yanashikiliwa kwenye escrow. Kagua masharti ya uwasilishaji, malipo na kurejeshewa pesa kabla ya kulipa.",
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
      stepRelease: "Kagua kilichowasilishwa na {name}. Malipo yanafuata masharti yaliyokubaliwa.",
      order: "Kagua oda · {amount} USDC",
      message: 'Mtumie {name} ujumbe',
      record: 'Rekodi',
      seller: 'muuzaji',
    },
  },
};
