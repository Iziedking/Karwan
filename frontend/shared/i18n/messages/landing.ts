/// Every word on the landing (view 49), in the five languages.

export type Platform = 'tiktok' | 'instagram' | 'facebook' | 'x' | 'linkedin';

interface Panel {
  label: string;
  title: string;
  flow: string;
}

interface Trade {
  title: string;
  label: string;
  figure: string;
  caption: string;
  from: string;
  to: string;
}

export interface LandingCopy {
  hero: {
    kicker: string;
    titleFirst: string;
    titleLast: string;
    create: string;
    explore: string;
    waitlist: string;
    promise: string;
    seeDemo: string;
    platformsLabel: string;
    platformNames: Record<Platform, string>;
    messages: Record<Platform, string>;
    termsLabel: string;
    termsTitle: string;
    agreeLabel: string;
    agreeTitle: string;
    phoneLabel: string;
  };
  phone: {
    conversation: string;
    bring: string;
    draft: string;
    fromChat: string;
    item: string;
    value: string;
    delivery: string;
    deliveryDays: string;
    reviewTime: string;
    reviewDays: string;
    milestones: string;
    milestoneSplit: string;
    sample: string;
    delivered: string;
    forReview: string;
    buyer: string;
    seller: string;
    send: string;
    bothSides: string;
    buyerLine: string;
    sellerLine: string;
    agreed: string;
    reviewing: string;
    accept: string;
    waitingSeller: string;
    waitingPay: string;
    pay: string;
    sellerPhone: string;
    buyerPhone: string;
  };
  panels: {
    learnMore: string;
    find: Panel & { request: string; requestWhere: string; agreedTerms: string; agreedLine: string };
    protect: Panel & { held: string; paid: string; heldShort: string; released: string };
    record: Panel & { dealPaid: string; sellerWhere: string; completed: string; onTime: string; disputes: string; shared: string; sharedLine: string; early: string; earlyLine: string };
  };
  trades: {
    eyebrow: string;
    title: string;
    released: string;
    items: Record<'tailor' | 'market' | 'developer' | 'designer' | 'seller' | 'finance', Trade>;
  };
  agent: {
    eyebrow: string;
    titleFirst: string;
    titleLast: string;
    steps: [string, string, string, string, string];
    now: string;
    bestFit: string;
    tailorPlace: string;
    tailorRecord: string;
    asks: string;
    limit: string;
    agree: string;
    keep: string;
    over: string;
    overCaption: string;
    request: string;
    requestLine: string;
    passed: string;
    passedOne: string;
    passedTwo: string;
    summary: string;
    rules: string[];
  };
  ask: {
    eyebrow: string;
    title: string;
    placeholder: string;
    send: string;
    chips: string[];
  };
  closing: {
    titleFirst: string;
    titleLast: string;
    open: string;
    waitlist: string;
    team: string;
    telegram: string;
    languagesLabel: string;
    languages: string;
    whereLabel: string;
    where: string;
    networkLabel: string;
    network: string;
    emailLabel: string;
  };
}

const NAMES: Record<Platform, string> = { tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', x: 'X', linkedin: 'LinkedIn' };
const LANGUAGES = 'English, Français, العربية, हिन्दी, Kiswahili';

export const landingCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', LandingCopy> = {
  en: {
    hero: {
      kicker: 'Trade from anywhere',
      titleFirst: 'Meet anywhere.',
      titleLast: 'Make it a deal.',
      create: 'Create a deal',
      explore: 'Explore the market',
      waitlist: 'Join the waitlist',
      promise: "Karwan holds the payment until the work or the goods arrive.",
      seeDemo: "See the demo",
      platformsLabel: 'Where the chat started',
      platformNames: NAMES,
      messages: {
        tiktok: 'Can you make 200 tote bags with our artwork?',
        instagram: 'Love your bags. Can you do 200 with our logo by month end?',
        facebook: 'Our shop needs 200 printed totes. What would that cost?',
        x: 'Your tote bags look great. Could you print 200 for us?',
        linkedin: 'We need 200 branded tote bags for an event. Can you quote?',
      },
      termsLabel: 'From chat to terms',
      termsTitle: 'Bring the conversation.\nKarwan writes the terms.',
      agreeLabel: 'Both sides agree',
      agreeTitle: 'Agree the terms.\nBoth sides see the same deal.',
      phoneLabel: 'A chat becoming a draft agreement on Karwan',
    },
    phone: {
      conversation: 'The conversation',
      bring: 'Bring the terms to Karwan',
      draft: 'Draft agreement',
      fromChat: 'From your {platform} chat',
      item: '200 custom tote bags',
      value: 'Deal value',
      delivery: 'Delivery',
      deliveryDays: '14 days',
      reviewTime: 'Review time',
      reviewDays: '3 days',
      milestones: 'Milestones',
      milestoneSplit: '30% · 70%',
      sample: 'Sample approved',
      delivered: 'Order delivered',
      forReview: 'For both sides to review',
      buyer: 'Buyer',
      seller: 'Seller',
      send: 'Send to Ada for review',
      bothSides: 'Both sides',
      buyerLine: 'Tunde Bello · buyer',
      sellerLine: 'Ada Obi · seller',
      agreed: 'Agreed',
      reviewing: 'Reviewing',
      accept: 'Accept terms',
      waitingSeller: 'Waiting for Ada',
      waitingPay: 'Waiting for payment',
      pay: 'Pay 1,240 USDC into escrow',
      sellerPhone: 'Ada’s phone',
      buyerPhone: 'Tunde’s phone',
    },
    panels: {
      learnMore: 'Learn more',
      find: {
        label: 'Find and agree',
        title: 'Find the right person. Agree the deal.',
        flow: 'request → offers → agreed terms',
        request: '200 tote bags',
        requestWhere: 'Request · Lagos',
        agreedTerms: 'Agreed terms',
        agreedLine: '1,240 USDC · 2 milestones',
      },
      protect: {
        label: 'Protected deals',
        title: 'The money waits until the work arrives.',
        flow: 'buyer → escrow → seller',
        held: 'Held in escrow',
        paid: '30% · paid',
        heldShort: '70% · held',
        released: 'Released on the terms',
      },
      record: {
        label: 'A record that travels',
        title: 'Every finished deal builds a record.',
        flow: 'deal → record → what it opens',
        dealPaid: 'Deal paid',
        sellerWhere: 'Seller · Lagos',
        completed: 'Deals completed',
        onTime: 'On time',
        disputes: 'Disputes',
        shared: 'Shared record',
        sharedLine: 'A link anyone can check',
        early: 'Paid early',
        earlyLine: 'Trade finance on the record',
      },
    },
    trades: {
      eyebrow: 'Built for real trade',
      title: 'Made for the way you already trade.',
      released: '{done} of {total} released',
      items: {
        tailor: { title: '200 tote bags, Lagos to London', label: 'Tailoring · paid in two milestones', figure: '$2,400', caption: 'held until the bags land', from: 'Lagos', to: 'London' },
        market: { title: 'Shea butter, Kano to Accra', label: 'Goods · released on delivery', figure: '$1,850', caption: 'paid when it arrives', from: 'Kano', to: 'Accra' },
        developer: { title: 'A developer paid every Friday', label: 'Code · one milestone a week', figure: '4', caption: 'weeks, four releases', from: 'Lagos', to: 'Berlin' },
        designer: { title: 'A brand kit for a Dubai startup', label: 'Design · Nairobi to Dubai', figure: '$900', caption: 'released on approval', from: 'Nairobi', to: 'Dubai' },
        seller: { title: 'One link, paid from Instagram', label: 'Payment link · the buyer pays in a tap', figure: '$85', caption: 'straight to your balance', from: 'Chat', to: 'Paid' },
        finance: { title: 'A supplier paid before delivery', label: 'Trade finance · paid early', figure: 'Early', caption: 'on your record', from: 'Tema', to: 'Lagos' },
      },
    },
    agent: {
      eyebrow: 'Your agent',
      titleFirst: 'It does the legwork.',
      titleLast: 'Money waits for your yes.',
      steps: ['Read your brief', 'Asked 6 tailors', '3 can do it', 'Best fit found', 'Your yes'],
      now: 'Now',
      bestFit: 'Best fit',
      tailorPlace: 'Tailor, Lagos',
      tailorRecord: '41 deals · 0 disputes · can make 30 Nov',
      asks: 'asks',
      limit: 'Your limit $2,400',
      agree: 'Agree $2,450',
      keep: 'Keep my limit',
      over: '+$50',
      overCaption: 'over your limit. Nothing moves until you say yes.',
      request: 'Your request',
      requestLine: '200 canvas tote bags by 30 Nov, up to $2,400',
      passed: 'Passed',
      passedOne: 'Tailor, Aba · can’t make 30 Nov',
      passedTwo: 'Tailor, Kano · asks $2,600, over your limit',
      summary: 'Your agent read your brief, asked six tailors and found three who can do it. The best fit asks $2,450, which is $50 over your $2,400 limit, so it waits for your yes.',
      rules: [
        'Inside your limits',
        'Asks before money moves',
        'Shows what it spent',
        'Forgets on request',
      ],
    },
    ask: {
      eyebrow: 'What you can ask',
      title: 'Ask in your own words.',
      placeholder: 'Ask Karwan…',
      send: 'Send',
      chips: ['Find a tailor in Aba', 'Hold $400 until it arrives', 'Check a seller before I pay', 'Send a payment link', 'Hire a freelancer by the week', 'What’s my record?', 'Get paid early', 'Cash out', 'Send $20 to a friend', 'Find shea butter in Kano'],
    },
    closing: {
      titleFirst: 'Your next deal',
      titleLast: 'can start in a chat.',
      open: 'Open Karwan',
      waitlist: 'Join the waitlist',
      team: 'Talk to our team',
      telegram: 'Or message the agent on Telegram',
      languagesLabel: 'Languages',
      languages: LANGUAGES,
      whereLabel: 'Where it works',
      where: 'On the website and in Telegram',
      networkLabel: 'Network',
      network: 'On Arc testnet today',
      emailLabel: 'Email the team',
    },
  },
  fr: {
    hero: {
      kicker: 'Commercez depuis partout',
      titleFirst: 'Rencontrez-vous partout.',
      titleLast: 'Faites-en un accord.',
      create: 'Créer un accord',
      explore: 'Explorer le marché',
      waitlist: 'Rejoindre la liste d’attente',
      promise: "Karwan garde le paiement jusqu’à l’arrivée du travail ou des marchandises.",
      seeDemo: "Voir la démo",
      platformsLabel: 'Où la discussion a commencé',
      platformNames: NAMES,
      messages: {
        tiktok: 'Pouvez-vous faire 200 sacs en toile avec notre motif ?',
        instagram: 'J’adore vos sacs. Pouvez-vous en faire 200 avec notre logo d’ici la fin du mois ?',
        facebook: 'Notre boutique a besoin de 200 sacs imprimés. Combien cela coûterait-il ?',
        x: 'Vos sacs en toile sont superbes. Pourriez-vous en imprimer 200 pour nous ?',
        linkedin: 'Il nous faut 200 sacs à notre marque pour un événement. Pouvez-vous faire un devis ?',
      },
      termsLabel: 'De la discussion aux conditions',
      termsTitle: 'Apportez la conversation.\nKarwan rédige les conditions.',
      agreeLabel: 'Les deux parties s’accordent',
      agreeTitle: 'Acceptez les conditions.\nLes deux parties voient le même accord.',
      phoneLabel: 'Une discussion qui devient un projet d’accord sur Karwan',
    },
    phone: {
      conversation: 'La conversation',
      bring: 'Apporter les conditions sur Karwan',
      draft: 'Projet d’accord',
      fromChat: 'Depuis votre discussion {platform}',
      item: '200 sacs en toile personnalisés',
      value: 'Montant de l’accord',
      delivery: 'Livraison',
      deliveryDays: '14 jours',
      reviewTime: 'Délai de relecture',
      reviewDays: '3 jours',
      milestones: 'Étapes',
      milestoneSplit: '30 % · 70 %',
      sample: 'Échantillon approuvé',
      delivered: 'Commande livrée',
      forReview: 'À relire par les deux parties',
      buyer: 'Acheteur',
      seller: 'Vendeuse',
      send: 'Envoyer à Ada pour relecture',
      bothSides: 'Les deux parties',
      buyerLine: 'Tunde Bello · acheteur',
      sellerLine: 'Ada Obi · vendeuse',
      agreed: 'D’accord',
      reviewing: 'Relit',
      accept: 'Accepter les conditions',
      waitingSeller: 'En attente d’Ada',
      waitingPay: 'En attente du paiement',
      pay: 'Verser 1 240 USDC en séquestre',
      sellerPhone: 'Le téléphone d’Ada',
      buyerPhone: 'Le téléphone de Tunde',
    },
    panels: {
      learnMore: 'En savoir plus',
      find: {
        label: 'Trouver et s’accorder',
        title: 'Trouvez la bonne personne. Concluez l’accord.',
        flow: 'demande → offres → conditions convenues',
        request: '200 sacs en toile',
        requestWhere: 'Demande · Lagos',
        agreedTerms: 'Conditions convenues',
        agreedLine: '1 240 USDC · 2 étapes',
      },
      protect: {
        label: 'Accords protégés',
        title: 'L’argent attend que le travail arrive.',
        flow: 'acheteur → séquestre → vendeur',
        held: 'En séquestre',
        paid: '30 % · payé',
        heldShort: '70 % · retenu',
        released: 'Libéré selon les conditions',
      },
      record: {
        label: 'Un historique qui vous suit',
        title: 'Chaque accord terminé construit votre historique.',
        flow: 'accord → historique → ce qu’il ouvre',
        dealPaid: 'Accord payé',
        sellerWhere: 'Vendeuse · Lagos',
        completed: 'Accords terminés',
        onTime: 'À l’heure',
        disputes: 'Litiges',
        shared: 'Historique partagé',
        sharedLine: 'Un lien que chacun peut vérifier',
        early: 'Payé en avance',
        earlyLine: 'Financement sur l’historique',
      },
    },
    trades: {
      eyebrow: 'Fait pour le vrai commerce',
      title: 'Fait pour votre façon de commercer.',
      released: '{done} sur {total} libérés',
      items: {
        tailor: { title: '200 sacs en toile, de Lagos à Londres', label: 'Couture · payé en deux étapes', figure: '2 400 $', caption: 'gardé jusqu’à l’arrivée des sacs', from: 'Lagos', to: 'Londres' },
        market: { title: 'Beurre de karité, de Kano à Accra', label: 'Marchandises · libéré à la livraison', figure: '1 850 $', caption: 'payé à l’arrivée', from: 'Kano', to: 'Accra' },
        developer: { title: 'Un développeur payé chaque vendredi', label: 'Code · une étape par semaine', figure: '4', caption: 'semaines, quatre paiements', from: 'Lagos', to: 'Berlin' },
        designer: { title: 'Une identité visuelle pour une start-up à Dubaï', label: 'Design · de Nairobi à Dubaï', figure: '900 $', caption: 'libéré à l’approbation', from: 'Nairobi', to: 'Dubaï' },
        seller: { title: 'Un lien, payé depuis Instagram', label: 'Lien de paiement · l’acheteur paie d’un geste', figure: '85 $', caption: 'directement sur votre solde', from: 'Discussion', to: 'Payé' },
        finance: { title: 'Un fournisseur payé avant la livraison', label: 'Financement · payé en avance', figure: 'Plus tôt', caption: 'sur votre historique', from: 'Tema', to: 'Lagos' },
      },
    },
    agent: {
      eyebrow: 'Votre agent',
      titleFirst: 'Il fait les démarches.',
      titleLast: 'L’argent attend votre oui.',
      steps: ['Lit votre demande', 'A contacté 6 tailleurs', '3 peuvent le faire', 'Le meilleur trouvé', 'Votre oui'],
      now: 'Maintenant',
      bestFit: 'Le meilleur',
      tailorPlace: 'Tailleur, Lagos',
      tailorRecord: '41 accords · 0 litige · prêt pour le 30 nov.',
      asks: 'demande',
      limit: 'Votre limite 2 400 $',
      agree: 'Accepter 2 450 $',
      keep: 'Garder ma limite',
      over: '+50 $',
      overCaption: 'au-dessus de votre limite. Rien ne bouge sans votre oui.',
      request: 'Votre demande',
      requestLine: '200 sacs en toile pour le 30 nov., jusqu’à 2 400 $',
      passed: 'Écarté',
      passedOne: 'Tailleur, Aba · pas prêt pour le 30 nov.',
      passedTwo: 'Tailleur, Kano · demande 2 600 $, au-dessus de votre limite',
      summary: 'Votre agent a lu votre demande, contacté six tailleurs et en a trouvé trois qui peuvent le faire. Le meilleur demande 2 450 $, soit 50 $ au-dessus de votre limite de 2 400 $, donc il attend votre oui.',
      rules: [
        'Dans vos limites',
        'Demande avant que l’argent bouge',
        'Montre ce qu’il a dépensé',
        'Oublie sur demande',
      ],
    },
    ask: {
      eyebrow: 'Ce que vous pouvez demander',
      title: 'Demandez avec vos mots.',
      placeholder: 'Demandez à Karwan…',
      send: 'Envoyer',
      chips: ['Trouver un tailleur à Aba', 'Garder 400 $ jusqu’à la livraison', 'Vérifier un vendeur avant de payer', 'Envoyer un lien de paiement', 'Engager un freelance à la semaine', 'Quel est mon historique ?', 'Être payé en avance', 'Retirer mon argent', 'Envoyer 20 $ à un ami', 'Trouver du karité à Kano'],
    },
    closing: {
      titleFirst: 'Votre prochain accord',
      titleLast: 'peut commencer dans une discussion.',
      open: 'Ouvrir Karwan',
      waitlist: 'Rejoindre la liste d’attente',
      team: 'Parler à notre équipe',
      telegram: 'Ou écrivez à l’agent sur Telegram',
      languagesLabel: 'Langues',
      languages: LANGUAGES,
      whereLabel: 'Où ça marche',
      where: 'Sur le site et dans Telegram',
      networkLabel: 'Réseau',
      network: 'Sur le testnet Arc aujourd’hui',
      emailLabel: 'Écrire à l’équipe',
    },
  },
  ar: {
    hero: {
      kicker: 'تاجر من أي مكان',
      titleFirst: 'التقِ في أي مكان.',
      titleLast: 'واجعلها صفقة.',
      create: 'أنشئ صفقة',
      explore: 'تصفح السوق',
      waitlist: 'انضم إلى قائمة الانتظار',
      promise: "كاروان يحتفظ بالدفعة حتى يصل العمل أو البضاعة.",
      seeDemo: "شاهد النسخة التجريبية",
      platformsLabel: 'أين بدأت المحادثة',
      platformNames: NAMES,
      messages: {
        tiktok: 'هل يمكنك صنع 200 حقيبة قماشية بتصميمنا؟',
        instagram: 'أحببت حقائبك. هل يمكنك صنع 200 بشعارنا قبل نهاية الشهر؟',
        facebook: 'متجرنا يحتاج 200 حقيبة مطبوعة. كم ستكلف؟',
        x: 'حقائبك القماشية رائعة. هل يمكنك طباعة 200 لنا؟',
        linkedin: 'نحتاج 200 حقيبة بعلامتنا لفعالية. هل ترسل لنا عرض سعر؟',
      },
      termsLabel: 'من المحادثة إلى الشروط',
      termsTitle: 'انقل المحادثة.\nكاروان يكتب الشروط.',
      agreeLabel: 'يتفق الطرفان',
      agreeTitle: 'اتفقا على الشروط.\nيرى الطرفان الصفقة نفسها.',
      phoneLabel: 'محادثة تتحول إلى مسودة اتفاق على كاروان',
    },
    phone: {
      conversation: 'المحادثة',
      bring: 'انقل الشروط إلى كاروان',
      draft: 'مسودة اتفاق',
      fromChat: 'من محادثتك على {platform}',
      item: '200 حقيبة قماشية مخصصة',
      value: 'قيمة الصفقة',
      delivery: 'التسليم',
      deliveryDays: '14 يومًا',
      reviewTime: 'مدة المراجعة',
      reviewDays: '3 أيام',
      milestones: 'المراحل',
      milestoneSplit: '30% · 70%',
      sample: 'اعتماد العينة',
      delivered: 'تسليم الطلب',
      forReview: 'ليراجعها الطرفان',
      buyer: 'المشتري',
      seller: 'البائعة',
      send: 'أرسلها إلى آدا للمراجعة',
      bothSides: 'الطرفان',
      buyerLine: 'تونده بيلو · المشتري',
      sellerLine: 'آدا أوبي · البائعة',
      agreed: 'موافق',
      reviewing: 'تراجع',
      accept: 'اقبل الشروط',
      waitingSeller: 'بانتظار آدا',
      waitingPay: 'بانتظار الدفع',
      pay: 'ادفع 1,240 USDC في الضمان',
      sellerPhone: 'هاتف آدا',
      buyerPhone: 'هاتف تونده',
    },
    panels: {
      learnMore: 'اعرف المزيد',
      find: {
        label: 'ابحث واتفق',
        title: 'اعثر على الشخص المناسب. واتفق على الصفقة.',
        flow: 'طلب ← عروض ← شروط متفق عليها',
        request: '200 حقيبة قماشية',
        requestWhere: 'طلب · لاغوس',
        agreedTerms: 'الشروط المتفق عليها',
        agreedLine: '1,240 USDC · مرحلتان',
      },
      protect: {
        label: 'صفقات محمية',
        title: 'المال ينتظر حتى يصل العمل.',
        flow: 'المشتري ← الضمان ← البائع',
        held: 'محجوز في الضمان',
        paid: '30% · مدفوع',
        heldShort: '70% · محجوز',
        released: 'يُصرف حسب الشروط',
      },
      record: {
        label: 'سجل يرافقك',
        title: 'كل صفقة منجزة تبني سجلًا.',
        flow: 'صفقة ← سجل ← ما يفتحه',
        dealPaid: 'صفقة مدفوعة',
        sellerWhere: 'بائعة · لاغوس',
        completed: 'صفقات منجزة',
        onTime: 'في الموعد',
        disputes: 'نزاعات',
        shared: 'سجل مُشارك',
        sharedLine: 'رابط يمكن لأي أحد التحقق منه',
        early: 'دفع مبكر',
        earlyLine: 'تمويل تجاري على السجل',
      },
    },
    trades: {
      eyebrow: 'مصنوع للتجارة الحقيقية',
      title: 'مصمم لطريقتك في التجارة.',
      released: '{done} من {total} صُرفت',
      items: {
        tailor: { title: '200 حقيبة قماشية، من لاغوس إلى لندن', label: 'خياطة · تُدفع على مرحلتين', figure: '$2,400', caption: 'محجوز حتى تصل الحقائب', from: 'لاغوس', to: 'لندن' },
        market: { title: 'زبدة الشيا، من كانو إلى أكرا', label: 'بضائع · تُصرف عند التسليم', figure: '$1,850', caption: 'تُدفع عند الوصول', from: 'كانو', to: 'أكرا' },
        developer: { title: 'مطوّر يُدفع له كل جمعة', label: 'برمجة · مرحلة كل أسبوع', figure: '4', caption: 'أسابيع، أربع دفعات', from: 'لاغوس', to: 'برلين' },
        designer: { title: 'هوية بصرية لشركة ناشئة في دبي', label: 'تصميم · من نيروبي إلى دبي', figure: '$900', caption: 'تُصرف عند الموافقة', from: 'نيروبي', to: 'دبي' },
        seller: { title: 'رابط واحد، دُفع من إنستغرام', label: 'رابط دفع · يدفع المشتري بلمسة', figure: '$85', caption: 'مباشرة إلى رصيدك', from: 'محادثة', to: 'مدفوع' },
        finance: { title: 'مورّد يُدفع له قبل التسليم', label: 'تمويل تجاري · دفع مبكر', figure: 'مبكرًا', caption: 'على سجلك', from: 'تيما', to: 'لاغوس' },
      },
    },
    agent: {
      eyebrow: 'وكيلك',
      titleFirst: 'يقوم بالعمل الشاق.',
      titleLast: 'والمال ينتظر موافقتك.',
      steps: ['قرأ طلبك', 'سأل 6 خياطين', '3 يستطيعون', 'وجد الأنسب', 'موافقتك'],
      now: 'الآن',
      bestFit: 'الأنسب',
      tailorPlace: 'خياطة، لاغوس',
      tailorRecord: '41 صفقة · 0 نزاع · جاهزة في 30 نوفمبر',
      asks: 'تطلب',
      limit: 'حدّك $2,400',
      agree: 'وافق على $2,450',
      keep: 'أبقِ حدّي',
      over: '+$50',
      overCaption: 'فوق حدّك. لا يتحرك شيء حتى توافق.',
      request: 'طلبك',
      requestLine: '200 حقيبة قماشية بحلول 30 نوفمبر، حتى $2,400',
      passed: 'استُبعد',
      passedOne: 'خياط، أبا · لا يستطيع 30 نوفمبر',
      passedTwo: 'خياط، كانو · يطلب $2,600، فوق حدّك',
      summary: 'قرأ وكيلك طلبك، وسأل ستة خياطين ووجد ثلاثة يستطيعون. الأنسب يطلب $2,450، أي $50 فوق حدّك البالغ $2,400، لذلك ينتظر موافقتك.',
      rules: [
        'داخل حدودك',
        'يسأل قبل أن يتحرك المال',
        'يُظهر ما أنفقه',
        'ينسى عند الطلب',
      ],
    },
    ask: {
      eyebrow: 'ما يمكنك أن تسأله',
      title: 'اسأل بكلماتك.',
      placeholder: 'اسأل كاروان…',
      send: 'إرسال',
      chips: ['ابحث عن خياط في أبا', 'احجز $400 حتى يصل', 'تحقق من البائع قبل أن أدفع', 'أرسل رابط دفع', 'وظّف مستقلًا بالأسبوع', 'ما هو سجلي؟', 'احصل على دفعة مبكرة', 'اسحب أموالي', 'أرسل $20 إلى صديق', 'ابحث عن زبدة الشيا في كانو'],
    },
    closing: {
      titleFirst: 'صفقتك القادمة',
      titleLast: 'يمكن أن تبدأ في محادثة.',
      open: 'افتح كاروان',
      waitlist: 'انضم إلى قائمة الانتظار',
      team: 'تحدث إلى فريقنا',
      telegram: 'أو راسل الوكيل على تيليغرام',
      languagesLabel: 'اللغات',
      languages: LANGUAGES,
      whereLabel: 'أين يعمل',
      where: 'على الموقع وفي تيليغرام',
      networkLabel: 'الشبكة',
      network: 'على شبكة Arc التجريبية اليوم',
      emailLabel: 'راسل الفريق',
    },
  },
  hi: {
    hero: {
      kicker: 'कहीं से भी व्यापार करें',
      titleFirst: 'कहीं भी मिलें।',
      titleLast: 'उसे सौदा बनाएँ।',
      create: 'सौदा बनाएँ',
      explore: 'मार्केट देखें',
      waitlist: 'वेटलिस्ट में जुड़ें',
      promise: "काम या सामान पहुँचने तक कारवान भुगतान सुरक्षित रखता है।",
      seeDemo: "डेमो देखें",
      platformsLabel: 'बातचीत कहाँ शुरू हुई',
      platformNames: NAMES,
      messages: {
        tiktok: 'क्या आप हमारे डिज़ाइन वाले 200 टोट बैग बना सकते हैं?',
        instagram: 'आपके बैग बहुत पसंद आए। क्या महीने के अंत तक हमारे लोगो वाले 200 बना सकते हैं?',
        facebook: 'हमारी दुकान को 200 छपे हुए टोट बैग चाहिए। कितना लगेगा?',
        x: 'आपके टोट बैग शानदार हैं। क्या हमारे लिए 200 छाप सकते हैं?',
        linkedin: 'एक इवेंट के लिए हमें अपने ब्रांड वाले 200 टोट बैग चाहिए। क्या कोटेशन भेज सकते हैं?',
      },
      termsLabel: 'बातचीत से शर्तों तक',
      termsTitle: 'बातचीत लाएँ।\nशर्तें Karwan लिखता है।',
      agreeLabel: 'दोनों पक्ष सहमत',
      agreeTitle: 'शर्तों पर सहमत हों।\nदोनों पक्ष एक ही सौदा देखते हैं।',
      phoneLabel: 'एक बातचीत जो Karwan पर समझौते का मसौदा बनती है',
    },
    phone: {
      conversation: 'बातचीत',
      bring: 'शर्तें Karwan पर लाएँ',
      draft: 'समझौते का मसौदा',
      fromChat: 'आपकी {platform} बातचीत से',
      item: '200 कस्टम टोट बैग',
      value: 'सौदे की राशि',
      delivery: 'डिलीवरी',
      deliveryDays: '14 दिन',
      reviewTime: 'जाँच का समय',
      reviewDays: '3 दिन',
      milestones: 'चरण',
      milestoneSplit: '30% · 70%',
      sample: 'सैंपल मंज़ूर',
      delivered: 'ऑर्डर डिलीवर',
      forReview: 'दोनों पक्षों की जाँच के लिए',
      buyer: 'खरीदार',
      seller: 'विक्रेता',
      send: 'जाँच के लिए Ada को भेजें',
      bothSides: 'दोनों पक्ष',
      buyerLine: 'Tunde Bello · खरीदार',
      sellerLine: 'Ada Obi · विक्रेता',
      agreed: 'सहमत',
      reviewing: 'देख रही हैं',
      accept: 'शर्तें स्वीकार करें',
      waitingSeller: 'Ada का इंतज़ार',
      waitingPay: 'भुगतान का इंतज़ार',
      pay: '1,240 USDC एस्क्रो में जमा करें',
      sellerPhone: 'Ada का फ़ोन',
      buyerPhone: 'Tunde का फ़ोन',
    },
    panels: {
      learnMore: 'और जानें',
      find: {
        label: 'खोजें और सहमत हों',
        title: 'सही व्यक्ति खोजें। सौदा पक्का करें।',
        flow: 'अनुरोध → ऑफ़र → तय शर्तें',
        request: '200 टोट बैग',
        requestWhere: 'अनुरोध · Lagos',
        agreedTerms: 'तय शर्तें',
        agreedLine: '1,240 USDC · 2 चरण',
      },
      protect: {
        label: 'सुरक्षित सौदे',
        title: 'पैसा काम पहुँचने तक इंतज़ार करता है।',
        flow: 'खरीदार → एस्क्रो → विक्रेता',
        held: 'एस्क्रो में रखा',
        paid: '30% · भुगतान हुआ',
        heldShort: '70% · रखा है',
        released: 'शर्तों पर जारी',
      },
      record: {
        label: 'साथ चलने वाला रिकॉर्ड',
        title: 'हर पूरा सौदा रिकॉर्ड बनाता है।',
        flow: 'सौदा → रिकॉर्ड → उससे क्या खुलता है',
        dealPaid: 'सौदे का भुगतान',
        sellerWhere: 'विक्रेता · Lagos',
        completed: 'पूरे सौदे',
        onTime: 'समय पर',
        disputes: 'विवाद',
        shared: 'साझा रिकॉर्ड',
        sharedLine: 'एक लिंक जिसे कोई भी जाँच सके',
        early: 'जल्दी भुगतान',
        earlyLine: 'रिकॉर्ड पर ट्रेड फ़ाइनेंस',
      },
    },
    trades: {
      eyebrow: 'असली व्यापार के लिए बना',
      title: 'आपके व्यापार के तरीके के लिए बना।',
      released: '{total} में से {done} जारी',
      items: {
        tailor: { title: '200 टोट बैग, Lagos से London', label: 'सिलाई · दो चरणों में भुगतान', figure: '$2,400', caption: 'बैग पहुँचने तक रखा', from: 'Lagos', to: 'London' },
        market: { title: 'शिया बटर, Kano से Accra', label: 'माल · डिलीवरी पर जारी', figure: '$1,850', caption: 'पहुँचने पर भुगतान', from: 'Kano', to: 'Accra' },
        developer: { title: 'हर शुक्रवार भुगतान पाने वाला डेवलपर', label: 'कोड · हर हफ़्ते एक चरण', figure: '4', caption: 'हफ़्ते, चार भुगतान', from: 'Lagos', to: 'Berlin' },
        designer: { title: 'Dubai के एक स्टार्टअप के लिए ब्रांड किट', label: 'डिज़ाइन · Nairobi से Dubai', figure: '$900', caption: 'मंज़ूरी पर जारी', from: 'Nairobi', to: 'Dubai' },
        seller: { title: 'एक लिंक, Instagram से भुगतान', label: 'भुगतान लिंक · खरीदार एक टैप में भुगतान करता है', figure: '$85', caption: 'सीधे आपके बैलेंस में', from: 'बातचीत', to: 'भुगतान' },
        finance: { title: 'डिलीवरी से पहले भुगतान पाने वाला सप्लायर', label: 'ट्रेड फ़ाइनेंस · जल्दी भुगतान', figure: 'जल्दी', caption: 'आपके रिकॉर्ड पर', from: 'Tema', to: 'Lagos' },
      },
    },
    agent: {
      eyebrow: 'आपका एजेंट',
      titleFirst: 'भागदौड़ वह करता है।',
      titleLast: 'पैसा आपकी हाँ का इंतज़ार करता है।',
      steps: ['आपका अनुरोध पढ़ा', '6 दर्ज़ियों से पूछा', '3 कर सकते हैं', 'सबसे सही मिला', 'आपकी हाँ'],
      now: 'अभी',
      bestFit: 'सबसे सही',
      tailorPlace: 'दर्ज़ी, Lagos',
      tailorRecord: '41 सौदे · 0 विवाद · 30 नवंबर तक कर सकती हैं',
      asks: 'माँगती हैं',
      limit: 'आपकी सीमा $2,400',
      agree: '$2,450 पर सहमत',
      keep: 'मेरी सीमा रखें',
      over: '+$50',
      overCaption: 'आपकी सीमा से ऊपर। आपकी हाँ के बिना कुछ नहीं होता।',
      request: 'आपका अनुरोध',
      requestLine: '30 नवंबर तक 200 कैनवस टोट बैग, $2,400 तक',
      passed: 'छोड़ा',
      passedOne: 'दर्ज़ी, Aba · 30 नवंबर तक नहीं कर सकते',
      passedTwo: 'दर्ज़ी, Kano · $2,600 माँगते हैं, आपकी सीमा से ऊपर',
      summary: 'आपके एजेंट ने अनुरोध पढ़ा, छह दर्ज़ियों से पूछा और तीन ऐसे पाए जो कर सकते हैं। सबसे सही $2,450 माँगती हैं, जो आपकी $2,400 की सीमा से $50 ज़्यादा है, इसलिए यह आपकी हाँ का इंतज़ार करता है।',
      rules: [
        'आपकी सीमा के भीतर',
        'पैसा हिलने से पहले पूछता है',
        'बताता है क्या खर्च किया',
        'कहने पर भूल जाता है',
      ],
    },
    ask: {
      eyebrow: 'आप क्या पूछ सकते हैं',
      title: 'अपने शब्दों में पूछें।',
      placeholder: 'Karwan से पूछें…',
      send: 'भेजें',
      chips: ['Aba में दर्ज़ी खोजें', 'पहुँचने तक $400 रोकें', 'भुगतान से पहले विक्रेता जाँचें', 'भुगतान लिंक भेजें', 'हफ़्ते के हिसाब से फ़्रीलांसर रखें', 'मेरा रिकॉर्ड क्या है?', 'जल्दी भुगतान पाएँ', 'पैसे निकालें', 'किसी दोस्त को $20 भेजें', 'Kano में शिया बटर खोजें'],
    },
    closing: {
      titleFirst: 'आपका अगला सौदा',
      titleLast: 'एक चैट से शुरू हो सकता है।',
      open: 'Karwan खोलें',
      waitlist: 'वेटलिस्ट में जुड़ें',
      team: 'हमारी टीम से बात करें',
      telegram: 'या Telegram पर एजेंट को संदेश भेजें',
      languagesLabel: 'भाषाएँ',
      languages: LANGUAGES,
      whereLabel: 'कहाँ काम करता है',
      where: 'वेबसाइट पर और Telegram में',
      networkLabel: 'नेटवर्क',
      network: 'आज Arc टेस्टनेट पर',
      emailLabel: 'टीम को ईमेल करें',
    },
  },
  sw: {
    hero: {
      kicker: 'Fanya biashara popote',
      titleFirst: 'Kutaneni popote.',
      titleLast: 'Ifanye mkataba.',
      create: 'Unda mkataba',
      explore: 'Tazama soko',
      waitlist: 'Jiunge na orodha ya kusubiri',
      promise: "Karwan hushikilia malipo hadi kazi au bidhaa zifike.",
      seeDemo: "Tazama onyesho",
      platformsLabel: 'Mazungumzo yalipoanzia',
      platformNames: NAMES,
      messages: {
        tiktok: 'Unaweza kutengeneza mifuko 200 ya kitambaa yenye mchoro wetu?',
        instagram: 'Napenda mifuko yako. Unaweza kutengeneza 200 yenye nembo yetu kabla ya mwisho wa mwezi?',
        facebook: 'Duka letu linahitaji mifuko 200 iliyochapishwa. Itagharimu kiasi gani?',
        x: 'Mifuko yako ya kitambaa ni mizuri. Unaweza kutuchapishia 200?',
        linkedin: 'Tunahitaji mifuko 200 yenye chapa yetu kwa tukio. Unaweza kutoa bei?',
      },
      termsLabel: 'Kutoka mazungumzo hadi masharti',
      termsTitle: 'Leta mazungumzo.\nKarwan huandika masharti.',
      agreeLabel: 'Pande zote zinakubali',
      agreeTitle: 'Kubalianeni masharti.\nPande zote zinaona mkataba mmoja.',
      phoneLabel: 'Mazungumzo yanayogeuka rasimu ya makubaliano kwenye Karwan',
    },
    phone: {
      conversation: 'Mazungumzo',
      bring: 'Leta masharti Karwan',
      draft: 'Rasimu ya makubaliano',
      fromChat: 'Kutoka mazungumzo yako ya {platform}',
      item: 'Mifuko 200 ya kitambaa maalum',
      value: 'Thamani ya mkataba',
      delivery: 'Uwasilishaji',
      deliveryDays: 'Siku 14',
      reviewTime: 'Muda wa kupitia',
      reviewDays: 'Siku 3',
      milestones: 'Hatua',
      milestoneSplit: '30% · 70%',
      sample: 'Sampuli imekubaliwa',
      delivered: 'Oda imewasilishwa',
      forReview: 'Kwa pande zote kupitia',
      buyer: 'Mnunuzi',
      seller: 'Muuzaji',
      send: 'Mtumie Ada apitie',
      bothSides: 'Pande zote',
      buyerLine: 'Tunde Bello · mnunuzi',
      sellerLine: 'Ada Obi · muuzaji',
      agreed: 'Amekubali',
      reviewing: 'Anapitia',
      accept: 'Kubali masharti',
      waitingSeller: 'Inamsubiri Ada',
      waitingPay: 'Inasubiri malipo',
      pay: 'Lipa USDC 1,240 kwenye escrow',
      sellerPhone: 'Simu ya Ada',
      buyerPhone: 'Simu ya Tunde',
    },
    panels: {
      learnMore: 'Jifunze zaidi',
      find: {
        label: 'Tafuta na kubaliana',
        title: 'Mpate mtu sahihi. Kubalianeni mkataba.',
        flow: 'ombi → ofa → masharti yaliyokubaliwa',
        request: 'Mifuko 200 ya kitambaa',
        requestWhere: 'Ombi · Lagos',
        agreedTerms: 'Masharti yaliyokubaliwa',
        agreedLine: 'USDC 1,240 · hatua 2',
      },
      protect: {
        label: 'Mikataba iliyolindwa',
        title: 'Pesa husubiri hadi kazi ifike.',
        flow: 'mnunuzi → escrow → muuzaji',
        held: 'Imeshikiliwa kwenye escrow',
        paid: '30% · imelipwa',
        heldShort: '70% · imeshikiliwa',
        released: 'Hutolewa kwa masharti',
      },
      record: {
        label: 'Rekodi inayokwenda nawe',
        title: 'Kila mkataba uliokamilika hujenga rekodi.',
        flow: 'mkataba → rekodi → inachofungua',
        dealPaid: 'Mkataba umelipwa',
        sellerWhere: 'Muuzaji · Lagos',
        completed: 'Mikataba iliyokamilika',
        onTime: 'Kwa wakati',
        disputes: 'Migogoro',
        shared: 'Rekodi iliyoshirikiwa',
        sharedLine: 'Kiungo ambacho yeyote anaweza kukagua',
        early: 'Amelipwa mapema',
        earlyLine: 'Ufadhili wa biashara kwenye rekodi',
      },
    },
    trades: {
      eyebrow: 'Imejengwa kwa biashara halisi',
      title: 'Imetengenezwa kwa jinsi unavyofanya biashara.',
      released: '{done} kati ya {total} zimetolewa',
      items: {
        tailor: { title: 'Mifuko 200, Lagos hadi London', label: 'Ushonaji · hulipwa kwa hatua mbili', figure: '$2,400', caption: 'imeshikiliwa hadi mifuko ifike', from: 'Lagos', to: 'London' },
        market: { title: 'Siagi ya shea, Kano hadi Accra', label: 'Bidhaa · hutolewa wakati wa kuwasilisha', figure: '$1,850', caption: 'hulipwa inapofika', from: 'Kano', to: 'Accra' },
        developer: { title: 'Msanidi analipwa kila Ijumaa', label: 'Msimbo · hatua moja kila wiki', figure: '4', caption: 'wiki, malipo manne', from: 'Lagos', to: 'Berlin' },
        designer: { title: 'Kifurushi cha chapa kwa kampuni changa ya Dubai', label: 'Usanifu · Nairobi hadi Dubai', figure: '$900', caption: 'hutolewa baada ya kukubaliwa', from: 'Nairobi', to: 'Dubai' },
        seller: { title: 'Kiungo kimoja, kimelipwa kutoka Instagram', label: 'Kiungo cha malipo · mnunuzi analipa kwa mguso mmoja', figure: '$85', caption: 'moja kwa moja kwenye salio lako', from: 'Mazungumzo', to: 'Imelipwa' },
        finance: { title: 'Msambazaji amelipwa kabla ya kuwasilisha', label: 'Ufadhili wa biashara · malipo ya mapema', figure: 'Mapema', caption: 'kwenye rekodi yako', from: 'Tema', to: 'Lagos' },
      },
    },
    agent: {
      eyebrow: 'Wakala wako',
      titleFirst: 'Hufanya kazi ngumu.',
      titleLast: 'Pesa husubiri ukubali.',
      steps: ['Amesoma ombi lako', 'Ameuliza mafundi 6', '3 wanaweza', 'Amepata anayefaa', 'Ukubali wako'],
      now: 'Sasa',
      bestFit: 'Anayefaa zaidi',
      tailorPlace: 'Fundi cherehani, Lagos',
      tailorRecord: 'Mikataba 41 · migogoro 0 · anaweza kufikia 30 Nov',
      asks: 'anaomba',
      limit: 'Kikomo chako $2,400',
      agree: 'Kubali $2,450',
      keep: 'Baki na kikomo changu',
      over: '+$50',
      overCaption: 'juu ya kikomo chako. Hakuna kinachosogea hadi ukubali.',
      request: 'Ombi lako',
      requestLine: 'Mifuko 200 ya kitambaa kufikia 30 Nov, hadi $2,400',
      passed: 'Ameachwa',
      passedOne: 'Fundi, Aba · hawezi kufikia 30 Nov',
      passedTwo: 'Fundi, Kano · anaomba $2,600, juu ya kikomo chako',
      summary: 'Wakala wako amesoma ombi lako, ameuliza mafundi sita na kupata watatu wanaoweza. Anayefaa zaidi anaomba $2,450, yaani $50 juu ya kikomo chako cha $2,400, kwa hiyo inasubiri ukubali.',
      rules: [
        'Ndani ya vikomo vyako',
        'Huuliza kabla pesa haijasogea',
        'Huonyesha alichotumia',
        'Husahau ukiomba',
      ],
    },
    ask: {
      eyebrow: 'Unachoweza kuuliza',
      title: 'Uliza kwa maneno yako.',
      placeholder: 'Uliza Karwan…',
      send: 'Tuma',
      chips: ['Tafuta fundi cherehani Aba', 'Shikilia $400 hadi ifike', 'Kagua muuzaji kabla sijalipa', 'Tuma kiungo cha malipo', 'Ajiri mfanyakazi huru kwa wiki', 'Rekodi yangu ikoje?', 'Lipwa mapema', 'Toa pesa', 'Tuma $20 kwa rafiki', 'Tafuta siagi ya shea Kano'],
    },
    closing: {
      titleFirst: 'Mkataba wako ujao',
      titleLast: 'unaweza kuanza kwenye mazungumzo.',
      open: 'Fungua Karwan',
      waitlist: 'Jiunge na orodha ya kusubiri',
      team: 'Ongea na timu yetu',
      telegram: 'Au mtumie wakala ujumbe kwenye Telegram',
      languagesLabel: 'Lugha',
      languages: LANGUAGES,
      whereLabel: 'Inapofanya kazi',
      where: 'Kwenye tovuti na kwenye Telegram',
      networkLabel: 'Mtandao',
      network: 'Kwenye testnet ya Arc leo',
      emailLabel: 'Tuma barua pepe kwa timu',
    },
  },
};

export const TEAM_EMAIL = 'admin@karwan.site';
