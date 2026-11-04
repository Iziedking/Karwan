/// Every word on the landing (view 49), in the five languages.

export type Platform = 'tiktok' | 'instagram' | 'facebook' | 'x' | 'linkedin';

interface Panel {
  label: string;
  title: string;
  body: string;
  points: [string, string, string];
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
    lead: string;
    create: string;
    explore: string;
    waitlist: string;
    tryTestnet: string;
    platformsLabel: string;
    platformNames: Record<Platform, string>;
    messages: Record<Platform, string>;
    termsLabel: string;
    termsTitle: string;
    termsBody: string;
    agreeLabel: string;
    agreeTitle: string;
    agreeBody: string;
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
    lede: string;
    released: string;
    items: Record<'tailor' | 'market' | 'developer' | 'designer' | 'seller' | 'finance', Trade>;
  };
  agent: {
    eyebrow: string;
    titleFirst: string;
    titleLast: string;
    lede: string;
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
    rules: [string, string][];
  };
  ask: {
    eyebrow: string;
    title: string;
    lede: string;
    placeholder: string;
    send: string;
    hint: string;
    chips: string[];
  };
  closing: {
    titleFirst: string;
    titleLast: string;
    body: string;
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
      lead: 'The right buyer or seller might be in your next message. Bring the conversation to Karwan. Agree on delivery and payment before either side commits.',
      create: 'Create a deal',
      explore: 'Explore the market',
      waitlist: 'Join the waitlist',
      tryTestnet: 'Try it on testnet',
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
      termsBody: 'Forward the chat to your agent or paste it in. Karwan pulls out what you agreed: the item, the price, the delivery date and the milestones.',
      agreeLabel: 'Both sides agree',
      agreeTitle: 'Agree the terms.\nBoth sides see the same deal.',
      agreeBody: 'Ada gets the same terms to review. She can accept, or ask to change the price or the dates. Nothing is paid until you both agree.',
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
        body: 'Post a request or an offer on the open market, or bring someone you already know with a deal link. Compare offers and agree the price and dates in one place.',
        points: ['Requests and offers in one market', 'Deal links for people you already know', 'Messages by tag, no phone numbers'],
        flow: 'request → offers → agreed terms',
        request: '200 tote bags',
        requestWhere: 'Request · Lagos',
        agreedTerms: 'Agreed terms',
        agreedLine: '1,240 USDC · 2 milestones',
      },
      protect: {
        label: 'Protected deals',
        title: 'The money waits until the work arrives.',
        body: 'The buyer pays into escrow on Arc. It releases milestone by milestone when the buyer approves, or when the review time ends. If something goes wrong, there is a fair dispute.',
        points: ['Up to five milestone payments', 'Delivery checked against the terms', 'Disputes ruled on the evidence'],
        flow: 'buyer → escrow → seller',
        held: 'Held in escrow',
        paid: '30% · paid',
        heldShort: '70% · held',
        released: 'Released on the terms',
      },
      record: {
        label: 'A record that travels',
        title: 'Every finished deal builds a record.',
        body: 'Deals completed, on time, disputes and ratings. Share it wherever you trade next. A good record turns into faster, cheaper money through trade finance.',
        points: ['One record for buying and selling', 'Share it with a link', 'Better records, earlier payment'],
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
      lede: 'Orders, goods, design work, weekly code, payment links and early pay. Each one held safely until both sides agree.',
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
      lede: 'It finds people, makes offers and keeps the deal moving, on the website and in Telegram. It never goes past the limit you set.',
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
        ['Inside your limits', 'It negotiates up to your price, never past it.'],
        ['Asks before money moves', 'Anything over your limit waits for you.'],
        ['Shows what it spent', 'A weekly budget it can’t pass, and a report.'],
        ['Forgets on request', 'See every note it keeps. Delete any.'],
      ],
    },
    ask: {
      eyebrow: 'What you can ask',
      title: 'Ask in your own words.',
      lede: 'Pick one up and throw it in, or type your own. The same agent answers on the website and in Telegram, in five languages.',
      placeholder: 'Ask Karwan…',
      send: 'Send',
      hint: 'Throw a chip into the chat, tap it, or type your own.',
      chips: ['Find a tailor in Aba', 'Hold $400 until it arrives', 'Is this seller real?', 'Send a payment link', 'Pay me every Friday', 'What’s my record?', 'Get paid early', 'Cash out', 'Reply in French', 'Find shea butter in Kano'],
    },
    closing: {
      titleFirst: 'Your next deal',
      titleLast: 'can start in a chat.',
      body: 'Tell your agent what you need. It finds the person, agrees the terms with you, and holds the money until the work is done.',
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
      lead: 'Le bon acheteur ou vendeur est peut-être dans votre prochain message. Apportez la conversation sur Karwan. Mettez-vous d’accord sur la livraison et le paiement avant que l’un ou l’autre ne s’engage.',
      create: 'Créer un accord',
      explore: 'Explorer le marché',
      waitlist: 'Rejoindre la liste d’attente',
      tryTestnet: 'Essayer sur le testnet',
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
      termsBody: 'Transférez la discussion à votre agent ou collez-la. Karwan en tire ce que vous avez convenu : l’article, le prix, la date de livraison et les étapes.',
      agreeLabel: 'Les deux parties s’accordent',
      agreeTitle: 'Acceptez les conditions.\nLes deux parties voient le même accord.',
      agreeBody: 'Ada reçoit les mêmes conditions à relire. Elle peut accepter, ou demander à changer le prix ou les dates. Rien n’est payé tant que vous n’êtes pas d’accord tous les deux.',
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
        body: 'Publiez une demande ou une offre sur le marché ouvert, ou amenez quelqu’un que vous connaissez déjà avec un lien d’accord. Comparez les offres et fixez le prix et les dates au même endroit.',
        points: ['Demandes et offres sur un seul marché', 'Des liens d’accord pour les gens que vous connaissez', 'Des messages par identifiant, sans numéro de téléphone'],
        flow: 'demande → offres → conditions convenues',
        request: '200 sacs en toile',
        requestWhere: 'Demande · Lagos',
        agreedTerms: 'Conditions convenues',
        agreedLine: '1 240 USDC · 2 étapes',
      },
      protect: {
        label: 'Accords protégés',
        title: 'L’argent attend que le travail arrive.',
        body: 'L’acheteur paie en séquestre sur Arc. L’argent est libéré étape par étape quand l’acheteur approuve, ou à la fin du délai de relecture. En cas de problème, il y a un litige équitable.',
        points: ['Jusqu’à cinq paiements par étape', 'Livraison vérifiée selon les conditions', 'Litiges tranchés sur les preuves'],
        flow: 'acheteur → séquestre → vendeur',
        held: 'En séquestre',
        paid: '30 % · payé',
        heldShort: '70 % · retenu',
        released: 'Libéré selon les conditions',
      },
      record: {
        label: 'Un historique qui vous suit',
        title: 'Chaque accord terminé construit votre historique.',
        body: 'Accords terminés, ponctualité, litiges et notes. Partagez-le partout où vous commercez ensuite. Un bon historique ouvre un financement plus rapide et moins cher.',
        points: ['Un historique pour acheter et vendre', 'Partagez-le avec un lien', 'Meilleur historique, paiement plus tôt'],
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
      lede: 'Commandes, marchandises, design, code à la semaine, liens de paiement et paiement anticipé. Chaque fois, l’argent est gardé en sûreté jusqu’à l’accord des deux parties.',
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
      lede: 'Il trouve des gens, fait des offres et fait avancer l’accord, sur le site et dans Telegram. Il ne dépasse jamais la limite que vous fixez.',
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
        ['Dans vos limites', 'Il négocie jusqu’à votre prix, jamais au-delà.'],
        ['Demande avant que l’argent bouge', 'Tout ce qui dépasse votre limite vous attend.'],
        ['Montre ce qu’il a dépensé', 'Un budget par semaine qu’il ne dépasse pas, et un rapport.'],
        ['Oublie sur demande', 'Voyez chaque note qu’il garde. Supprimez-en.'],
      ],
    },
    ask: {
      eyebrow: 'Ce que vous pouvez demander',
      title: 'Demandez avec vos mots.',
      lede: 'Lancez-en une dans la discussion, ou tapez la vôtre. Le même agent répond sur le site et dans Telegram, en cinq langues.',
      placeholder: 'Demandez à Karwan…',
      send: 'Envoyer',
      hint: 'Lancez une demande dans la discussion, touchez-la ou tapez la vôtre.',
      chips: ['Trouver un tailleur à Aba', 'Garder 400 $ jusqu’à la livraison', 'Ce vendeur est-il fiable ?', 'Envoyer un lien de paiement', 'Me payer chaque vendredi', 'Quel est mon historique ?', 'Être payé en avance', 'Retirer mon argent', 'Répondre en anglais', 'Trouver du karité à Kano'],
    },
    closing: {
      titleFirst: 'Votre prochain accord',
      titleLast: 'peut commencer dans une discussion.',
      body: 'Dites à votre agent ce qu’il vous faut. Il trouve la personne, fixe les conditions avec vous et garde l’argent jusqu’à ce que le travail soit fait.',
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
      lead: 'قد يكون المشتري أو البائع المناسب في رسالتك القادمة. انقل المحادثة إلى كاروان. اتفقا على التسليم والدفع قبل أن يلتزم أي طرف.',
      create: 'أنشئ صفقة',
      explore: 'تصفح السوق',
      waitlist: 'انضم إلى قائمة الانتظار',
      tryTestnet: 'جرّبه على الشبكة التجريبية',
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
      termsBody: 'حوّل المحادثة إلى وكيلك أو الصقها. يستخرج كاروان ما اتفقتما عليه: السلعة والسعر وموعد التسليم والمراحل.',
      agreeLabel: 'يتفق الطرفان',
      agreeTitle: 'اتفقا على الشروط.\nيرى الطرفان الصفقة نفسها.',
      agreeBody: 'تتلقى آدا الشروط نفسها لمراجعتها. يمكنها القبول، أو طلب تغيير السعر أو المواعيد. لا يُدفع شيء حتى تتفقا.',
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
        body: 'انشر طلبًا أو عرضًا في السوق المفتوح، أو أحضر شخصًا تعرفه برابط صفقة. قارن العروض واتفق على السعر والمواعيد في مكان واحد.',
        points: ['الطلبات والعروض في سوق واحد', 'روابط صفقات لمن تعرفهم', 'رسائل بالمعرّف، بلا أرقام هواتف'],
        flow: 'طلب ← عروض ← شروط متفق عليها',
        request: '200 حقيبة قماشية',
        requestWhere: 'طلب · لاغوس',
        agreedTerms: 'الشروط المتفق عليها',
        agreedLine: '1,240 USDC · مرحلتان',
      },
      protect: {
        label: 'صفقات محمية',
        title: 'المال ينتظر حتى يصل العمل.',
        body: 'يدفع المشتري في حساب ضمان على Arc. يُصرف المال مرحلة بعد مرحلة عندما يوافق المشتري، أو عند انتهاء مدة المراجعة. وإذا حدث خطأ، هناك نزاع عادل.',
        points: ['حتى خمس دفعات على مراحل', 'التسليم يُطابق مع الشروط', 'النزاعات تُحسم بالأدلة'],
        flow: 'المشتري ← الضمان ← البائع',
        held: 'محجوز في الضمان',
        paid: '30% · مدفوع',
        heldShort: '70% · محجوز',
        released: 'يُصرف حسب الشروط',
      },
      record: {
        label: 'سجل يرافقك',
        title: 'كل صفقة منجزة تبني سجلًا.',
        body: 'الصفقات المنجزة، والالتزام بالمواعيد، والنزاعات، والتقييمات. شاركه أينما تاجرت بعد ذلك. السجل الجيد يتحول إلى تمويل أسرع وأرخص.',
        points: ['سجل واحد للشراء والبيع', 'شاركه برابط', 'سجل أفضل، دفع أبكر'],
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
      lede: 'طلبيات، وبضائع، وتصميم، وبرمجة أسبوعية، وروابط دفع، ودفع مبكر. في كل مرة يبقى المال آمنًا حتى يتفق الطرفان.',
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
      lede: 'يجد الأشخاص ويقدّم العروض ويحرّك الصفقة، على الموقع وفي تيليغرام. ولا يتجاوز أبدًا الحد الذي تضعه.',
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
        ['داخل حدودك', 'يفاوض حتى سعرك، ولا يتجاوزه أبدًا.'],
        ['يسأل قبل أن يتحرك المال', 'كل ما يتجاوز حدّك ينتظرك.'],
        ['يُظهر ما أنفقه', 'ميزانية أسبوعية لا يتجاوزها، وتقرير.'],
        ['ينسى عند الطلب', 'اطّلع على كل ملاحظة يحتفظ بها. واحذف ما تشاء.'],
      ],
    },
    ask: {
      eyebrow: 'ما يمكنك أن تسأله',
      title: 'اسأل بكلماتك.',
      lede: 'ارمِ واحدة في المحادثة، أو اكتب سؤالك. الوكيل نفسه يجيب على الموقع وفي تيليغرام، بخمس لغات.',
      placeholder: 'اسأل كاروان…',
      send: 'إرسال',
      hint: 'ارمِ طلبًا في المحادثة، أو المسه، أو اكتب سؤالك.',
      chips: ['ابحث عن خياط في أبا', 'احجز $400 حتى يصل', 'هل هذا البائع حقيقي؟', 'أرسل رابط دفع', 'ادفع لي كل جمعة', 'ما هو سجلي؟', 'احصل على دفعة مبكرة', 'اسحب أموالي', 'أجب بالفرنسية', 'ابحث عن زبدة الشيا في كانو'],
    },
    closing: {
      titleFirst: 'صفقتك القادمة',
      titleLast: 'يمكن أن تبدأ في محادثة.',
      body: 'أخبر وكيلك بما تحتاجه. يجد الشخص، ويتفق معك على الشروط، ويحتفظ بالمال حتى يُنجز العمل.',
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
      lead: 'सही खरीदार या विक्रेता आपके अगले संदेश में हो सकता है। बातचीत Karwan पर लाएँ। किसी के वादा करने से पहले डिलीवरी और भुगतान पर सहमत हों।',
      create: 'सौदा बनाएँ',
      explore: 'मार्केट देखें',
      waitlist: 'वेटलिस्ट में जुड़ें',
      tryTestnet: 'टेस्टनेट पर आज़माएँ',
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
      termsBody: 'बातचीत अपने एजेंट को भेजें या पेस्ट करें। Karwan वह निकाल लेता है जिस पर आप सहमत हुए: सामान, कीमत, डिलीवरी की तारीख और चरण।',
      agreeLabel: 'दोनों पक्ष सहमत',
      agreeTitle: 'शर्तों पर सहमत हों।\nदोनों पक्ष एक ही सौदा देखते हैं।',
      agreeBody: 'Ada को वही शर्तें देखने के लिए मिलती हैं। वह स्वीकार कर सकती है, या कीमत या तारीख बदलने को कह सकती है। जब तक दोनों सहमत न हों, कुछ भी भुगतान नहीं होता।',
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
        body: 'खुले मार्केट में अनुरोध या ऑफ़र डालें, या किसी जान-पहचान वाले को सौदे के लिंक से लाएँ। ऑफ़र की तुलना करें और कीमत व तारीखें एक ही जगह तय करें।',
        points: ['एक मार्केट में अनुरोध और ऑफ़र', 'जान-पहचान वालों के लिए सौदे के लिंक', 'टैग से संदेश, फ़ोन नंबर नहीं'],
        flow: 'अनुरोध → ऑफ़र → तय शर्तें',
        request: '200 टोट बैग',
        requestWhere: 'अनुरोध · Lagos',
        agreedTerms: 'तय शर्तें',
        agreedLine: '1,240 USDC · 2 चरण',
      },
      protect: {
        label: 'सुरक्षित सौदे',
        title: 'पैसा काम पहुँचने तक इंतज़ार करता है।',
        body: 'खरीदार Arc पर एस्क्रो में भुगतान करता है। खरीदार की मंज़ूरी पर, या जाँच का समय खत्म होने पर, पैसा चरण-दर-चरण जारी होता है। कुछ गलत हो तो निष्पक्ष विवाद होता है।',
        points: ['पाँच तक चरणवार भुगतान', 'डिलीवरी शर्तों से मिलाई जाती है', 'विवाद सबूतों पर तय होते हैं'],
        flow: 'खरीदार → एस्क्रो → विक्रेता',
        held: 'एस्क्रो में रखा',
        paid: '30% · भुगतान हुआ',
        heldShort: '70% · रखा है',
        released: 'शर्तों पर जारी',
      },
      record: {
        label: 'साथ चलने वाला रिकॉर्ड',
        title: 'हर पूरा सौदा रिकॉर्ड बनाता है।',
        body: 'पूरे सौदे, समय पर, विवाद और रेटिंग। जहाँ भी आगे व्यापार करें, उसे साझा करें। अच्छा रिकॉर्ड तेज़ और सस्ते ट्रेड फ़ाइनेंस में बदलता है।',
        points: ['खरीद और बिक्री के लिए एक रिकॉर्ड', 'लिंक से साझा करें', 'बेहतर रिकॉर्ड, जल्दी भुगतान'],
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
      lede: 'ऑर्डर, माल, डिज़ाइन, हफ़्तेवार कोड, भुगतान लिंक और जल्दी भुगतान। हर बार पैसा तब तक सुरक्षित रहता है जब तक दोनों पक्ष सहमत न हों।',
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
      lede: 'वह लोगों को ढूँढता है, ऑफ़र देता है और सौदा आगे बढ़ाता है, वेबसाइट पर और Telegram में। वह आपकी तय सीमा कभी पार नहीं करता।',
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
        ['आपकी सीमा के भीतर', 'आपकी कीमत तक मोलभाव करता है, उससे आगे कभी नहीं।'],
        ['पैसा हिलने से पहले पूछता है', 'सीमा से ऊपर की हर बात आपका इंतज़ार करती है।'],
        ['बताता है क्या खर्च किया', 'एक हफ़्तेवार बजट जिसे वह पार नहीं करता, और एक रिपोर्ट।'],
        ['कहने पर भूल जाता है', 'वह जो भी नोट रखता है, देखें। कोई भी मिटाएँ।'],
      ],
    },
    ask: {
      eyebrow: 'आप क्या पूछ सकते हैं',
      title: 'अपने शब्दों में पूछें।',
      lede: 'एक उठाकर चैट में फेंकें, या अपना लिखें। वही एजेंट वेबसाइट पर और Telegram में, पाँच भाषाओं में जवाब देता है।',
      placeholder: 'Karwan से पूछें…',
      send: 'भेजें',
      hint: 'एक अनुरोध चैट में फेंकें, उसे टैप करें, या अपना लिखें।',
      chips: ['Aba में दर्ज़ी खोजें', 'पहुँचने तक $400 रोकें', 'क्या यह विक्रेता असली है?', 'भुगतान लिंक भेजें', 'मुझे हर शुक्रवार भुगतान करें', 'मेरा रिकॉर्ड क्या है?', 'जल्दी भुगतान पाएँ', 'पैसे निकालें', 'फ़्रेंच में जवाब दें', 'Kano में शिया बटर खोजें'],
    },
    closing: {
      titleFirst: 'आपका अगला सौदा',
      titleLast: 'एक चैट से शुरू हो सकता है।',
      body: 'अपने एजेंट को बताएँ कि आपको क्या चाहिए। वह व्यक्ति खोजता है, आपके साथ शर्तें तय करता है, और काम पूरा होने तक पैसा रखता है।',
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
      lead: 'Mnunuzi au muuzaji sahihi anaweza kuwa kwenye ujumbe wako ujao. Leta mazungumzo Karwan. Kubalianeni kuhusu uwasilishaji na malipo kabla upande wowote haujajifunga.',
      create: 'Unda mkataba',
      explore: 'Tazama soko',
      waitlist: 'Jiunge na orodha ya kusubiri',
      tryTestnet: 'Jaribu kwenye testnet',
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
      termsBody: 'Tuma mazungumzo kwa wakala wako au yabandike. Karwan hutoa mlichokubaliana: bidhaa, bei, tarehe ya uwasilishaji na hatua.',
      agreeLabel: 'Pande zote zinakubali',
      agreeTitle: 'Kubalianeni masharti.\nPande zote zinaona mkataba mmoja.',
      agreeBody: 'Ada anapata masharti yale yale ili ayapitie. Anaweza kukubali, au kuomba kubadilisha bei au tarehe. Hakuna kinacholipwa hadi mkubaliane wote.',
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
        body: 'Weka ombi au ofa kwenye soko huria, au mlete mtu unayemjua kwa kiungo cha mkataba. Linganisha ofa na kubalianeni bei na tarehe mahali pamoja.',
        points: ['Maombi na ofa kwenye soko moja', 'Viungo vya mkataba kwa watu unaowajua', 'Ujumbe kwa lebo, bila namba za simu'],
        flow: 'ombi → ofa → masharti yaliyokubaliwa',
        request: 'Mifuko 200 ya kitambaa',
        requestWhere: 'Ombi · Lagos',
        agreedTerms: 'Masharti yaliyokubaliwa',
        agreedLine: 'USDC 1,240 · hatua 2',
      },
      protect: {
        label: 'Mikataba iliyolindwa',
        title: 'Pesa husubiri hadi kazi ifike.',
        body: 'Mnunuzi analipa kwenye escrow kwenye Arc. Pesa hutolewa hatua kwa hatua mnunuzi anapokubali, au muda wa kupitia unapoisha. Jambo likienda vibaya, kuna mgogoro wa haki.',
        points: ['Hadi malipo matano ya hatua', 'Uwasilishaji hulinganishwa na masharti', 'Migogoro huamuliwa kwa ushahidi'],
        flow: 'mnunuzi → escrow → muuzaji',
        held: 'Imeshikiliwa kwenye escrow',
        paid: '30% · imelipwa',
        heldShort: '70% · imeshikiliwa',
        released: 'Hutolewa kwa masharti',
      },
      record: {
        label: 'Rekodi inayokwenda nawe',
        title: 'Kila mkataba uliokamilika hujenga rekodi.',
        body: 'Mikataba iliyokamilika, kwa wakati, migogoro na ukadiriaji. Ishiriki popote unapofanya biashara baadaye. Rekodi nzuri hugeuka kuwa fedha za haraka na nafuu kupitia ufadhili wa biashara.',
        points: ['Rekodi moja ya kununua na kuuza', 'Ishiriki kwa kiungo', 'Rekodi bora, malipo ya mapema'],
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
      lede: 'Oda, bidhaa, kazi ya usanifu, msimbo wa kila wiki, viungo vya malipo na malipo ya mapema. Kila mara pesa hukaa salama hadi pande zote zikubaliane.',
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
      lede: 'Hutafuta watu, hutoa ofa na husogeza mkataba, kwenye tovuti na kwenye Telegram. Hapiti kamwe kikomo ulichoweka.',
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
        ['Ndani ya vikomo vyako', 'Hujadiliana hadi bei yako, kamwe zaidi.'],
        ['Huuliza kabla pesa haijasogea', 'Chochote juu ya kikomo chako kinakusubiri.'],
        ['Huonyesha alichotumia', 'Bajeti ya wiki asiyoipita, na ripoti.'],
        ['Husahau ukiomba', 'Ona kila dokezo analoweka. Futa lolote.'],
      ],
    },
    ask: {
      eyebrow: 'Unachoweza kuuliza',
      title: 'Uliza kwa maneno yako.',
      lede: 'Chukua moja uitupe kwenye mazungumzo, au andika lako. Wakala yule yule hujibu kwenye tovuti na kwenye Telegram, kwa lugha tano.',
      placeholder: 'Uliza Karwan…',
      send: 'Tuma',
      hint: 'Tupa ombi kwenye mazungumzo, liguse, au andika lako.',
      chips: ['Tafuta fundi cherehani Aba', 'Shikilia $400 hadi ifike', 'Je, muuzaji huyu ni halisi?', 'Tuma kiungo cha malipo', 'Nilipe kila Ijumaa', 'Rekodi yangu ikoje?', 'Lipwa mapema', 'Toa pesa', 'Jibu kwa Kifaransa', 'Tafuta siagi ya shea Kano'],
    },
    closing: {
      titleFirst: 'Mkataba wako ujao',
      titleLast: 'unaweza kuanza kwenye mazungumzo.',
      body: 'Mwambie wakala wako unachohitaji. Humpata mtu, hukubaliana nawe masharti, na hushikilia pesa hadi kazi ikamilike.',
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
