type StateCopy = { headline: string; detail: string };

export interface SearchCopy {
  find: {
    title: string;
    need: string;
    budget: string;
    when: string;
    days: string;
    moreTerms: string;
    room: string;
    roomUnit: string;
    split: string;
    provenOnly: string;
    start: string;
    direct: string;
    requestsTitle: string;
    requestsEmpty: string;
    requestsError: string;
    errors: { need: string; budget: string; when: string; room: string; split: string };
  };
  sheet: {
    requestTitle: string;
    offerTitle: string;
    requestLead: string;
    offerLead: string;
    setupLine: string;
    moveLine: string;
    needsProfile: string;
    finishProfile: string;
    needsMoney: string;
    addMoney: string;
    loading: string;
    start: string;
    setupStart: string;
    moveStart: string;
    setupMoveStart: string;
    post: string;
    setupPost: string;
    steps: { setup: string; move: string; post: string; postOffer: string };
    status: { waiting: string; running: string; slow: string; done: string; failed: string };
    checkAgain: string;
    tryAgain: string;
    close: string;
    notPosted: string;
    movedStays: string;
  };
  request: {
    upTo: string;
    aRequest: string;
    back: string;
    backSeller: string;
    states: {
      looking: StateCopy;
      offersArriving: StateCopy;
      negotiating: StateCopy;
      closing: StateCopy;
      nearMissYou: StateCopy;
      nearMissThem: StateCopy;
      outOfReach: StateCopy;
      matchWaitingSellerBuyer: StateCopy;
      matchWaitingSellerSeller: StateCopy;
      matchRaisedBuyer: StateCopy;
      matchRaisedOverCap: StateCopy;
      matchRaisedSeller: StateCopy;
      matchShortBuyer: StateCopy;
      matchShortSeller: StateCopy;
      funding: StateCopy;
      declined: StateCopy;
      expired: StateCopy;
      cancelled: StateCopy;
      funded: StateCopy;
    };
    actions: {
      acceptMatch: string;
      raiseMatch: string;
      declineMatch: string;
      acceptRaise: string;
      declineRaise: string;
      addFunds: string;
      proceedNearMiss: string;
      declineNearMiss: string;
      openDeal: string;
      reconsider: string;
    };
    match: { was: string };
    raise: { label: string; send: string; cancel: string };
    offers: { title: string; skill: string; show: string; hide: string; unnamed: string };
    timeline: string;
    error: string;
  };
  seller: {
    title: string;
    needsYou: string;
    bidding: string;
    offers: string;
    post: string;
    accept: string;
    states: { offered: string; negotiating: string; won: string; lost: string; withdrawn: string; expired: string };
    withdraw: string;
    withdrawConfirm: string;
    daysLeft: string;
    loadError: string;
    biddingEmpty: string;
    offersEmpty: string;
  };
  offer: {
    title: string;
    what: string;
    details: string;
    price: string;
    room: string;
    roomUnit: string;
    ttl: string;
    days: string;
    submit: string;
    errors: { what: string; details: string; price: string; room: string; ttl: string };
  };
}

const en: SearchCopy = {
  find: {
    title: 'Find me a seller',
    need: 'What do you need?',
    budget: 'Most you will pay',
    when: 'When',
    days: 'days',
    moreTerms: 'More terms',
    room: 'Negotiation room',
    roomUnit: '% above your budget',
    split: 'Milestones',
    provenOnly: 'Proven sellers only',
    start: 'Start the search',
    direct: 'Already have a seller? Start a direct deal',
    requestsTitle: 'Your requests',
    requestsEmpty: 'No requests yet.',
    requestsError: 'Your requests did not load. Try again.',
    errors: {
      need: 'Use 5 to 500 characters.',
      budget: 'Enter an amount above 0.',
      when: 'Enter 1 to 90 days.',
      room: 'Enter 0 to 50.',
      split: 'Use 2 to 5 parts that total 100.',
    },
  },
  sheet: {
    requestTitle: 'Start the search',
    offerTitle: 'Post an offer',
    requestLead: 'Your agent looks for a seller for up to {amount} USDC, within {days} days. It never pays without you.',
    offerLead: 'Your agent offers {title} from {amount} USDC and bids on requests that fit.',
    setupLine: 'Sets up your agents. Once.',
    moveLine: 'Moves {amount} USDC to your buyer agent. You can move it back from Account if you cancel the request.',
    needsProfile: 'Finish your profile first.',
    finishProfile: 'Finish profile',
    needsMoney: 'Add {amount} USDC to your balance first.',
    addMoney: 'Add USDC',
    loading: 'Checking your balance',
    start: 'Start the search',
    setupStart: 'Set up and start',
    moveStart: 'Move {amount} USDC and start',
    setupMoveStart: 'Set up, move {amount} USDC and start',
    post: 'Post the offer',
    setupPost: 'Set up and post',
    steps: { setup: 'Setting up agents', move: 'Moving {amount} USDC', post: 'Posting your request', postOffer: 'Posting your offer' },
    status: { waiting: 'Waiting', running: 'In progress', slow: 'Taking longer than usual', done: 'Done', failed: 'Did not go through' },
    checkAgain: 'Check again',
    tryAgain: 'Try again',
    close: 'Close',
    notPosted: 'Nothing was posted.',
    movedStays: 'The {amount} USDC moved stays with your buyer agent.',
  },
  request: {
    upTo: 'up to {amount} USDC',
    aRequest: 'A request',
    back: 'Your requests',
    backSeller: 'Selling',
    states: {
      looking: { headline: 'Looking for sellers.', detail: 'Offers close shortly after the last one arrives.' },
      offersArriving: { headline: '{count} offers so far.', detail: 'Your agent is comparing them.' },
      negotiating: { headline: 'Negotiating.', detail: 'Your agent is working toward your budget.' },
      closing: { headline: 'Closing.', detail: 'The deadline passed. Finishing up.' },
      nearMissYou: { headline: 'A match is close.', detail: 'They ask {price} USDC, outside your range.' },
      nearMissThem: { headline: 'A match is close.', detail: 'Waiting on the other side.' },
      outOfReach: { headline: 'No seller fits your budget.', detail: 'Edit the request or reconsider the last price.' },
      matchWaitingSellerBuyer: { headline: 'Match found.', detail: 'Waiting for {name} to accept. Your agent funds escrow when they accept.' },
      matchWaitingSellerSeller: { headline: 'A buyer wants this.', detail: 'Accept to start the deal at {price} USDC.' },
      matchRaisedBuyer: { headline: 'The seller asks more.', detail: '{price} USDC, was {was} USDC.' },
      matchRaisedOverCap: { headline: 'The seller asks more than your budget.', detail: '{price} USDC, was {was} USDC.' },
      matchRaisedSeller: { headline: 'Waiting for the buyer.', detail: 'You asked {price} USDC.' },
      matchShortBuyer: { headline: 'Match found. Your agent is short.', detail: 'Add {amount} USDC so escrow can fund.' },
      matchShortSeller: { headline: 'Match found.', detail: 'Waiting for the buyer to add funds.' },
      funding: { headline: 'Funding escrow.', detail: 'Waiting for the network.' },
      declined: { headline: 'No deal this time.', detail: 'The negotiation ended without agreement.' },
      expired: { headline: 'Request expired.', detail: 'No match before the deadline.' },
      cancelled: { headline: 'Request cancelled.', detail: 'Nothing was paid.' },
      funded: { headline: 'Escrow funded.', detail: 'The deal continues on its page.' },
    },
    actions: {
      acceptMatch: 'Accept match',
      raiseMatch: 'Ask for more',
      declineMatch: 'Decline',
      acceptRaise: 'Accept {price} USDC',
      declineRaise: 'Decline',
      addFunds: 'Add {amount} USDC',
      proceedNearMiss: 'Go ahead at {price} USDC',
      declineNearMiss: 'Pass',
      openDeal: 'Open the deal',
      reconsider: 'Reconsider {price} USDC',
    },
    match: { was: 'was {was} USDC' },
    raise: { label: 'Your price', send: 'Send', cancel: 'Cancel' },
    offers: { title: 'Offers received ({count})', skill: 'Skill match {pct}%', show: 'Show', hide: 'Hide', unnamed: 'A seller' },
    timeline: 'What your agent did',
    error: 'That did not go through. Try again.',
  },
  seller: {
    title: 'Selling',
    needsYou: 'Needs you',
    bidding: 'Your agent is bidding on',
    offers: 'Your offers',
    post: 'Post an offer',
    accept: 'Accept match',
    states: { offered: 'Offered', negotiating: 'Negotiating', won: 'Won', lost: 'Lost', withdrawn: 'Withdrawn', expired: 'Expired' },
    withdraw: 'Withdraw',
    withdrawConfirm: 'Confirm withdraw',
    daysLeft: '{days} days left',
    loadError: 'Your selling desk did not load. Try again.',
    biddingEmpty: 'No bids right now.',
    offersEmpty: 'No offers up.',
  },
  offer: {
    title: 'Post an offer',
    what: 'What you offer',
    details: 'Details',
    price: 'Price',
    room: 'Negotiation room',
    roomUnit: '% below your price',
    ttl: 'Keep it up for',
    days: 'days',
    submit: 'Post an offer',
    errors: { what: 'Use 3 to 120 characters.', details: 'Add details, 5 to 500 characters.', price: 'Enter an amount above 0.', room: 'Enter 0 to 50.', ttl: 'Enter 1 to 90 days.' },
  },
};

const fr: SearchCopy = {
  find: {
    title: 'Trouvez-moi un vendeur',
    need: 'De quoi avez-vous besoin ?',
    budget: 'Montant maximum',
    when: 'Délai',
    days: 'jours',
    moreTerms: 'Plus de conditions',
    room: 'Marge de négociation',
    roomUnit: '% au-dessus de votre budget',
    split: 'Étapes de paiement',
    provenOnly: 'Vendeurs confirmés uniquement',
    start: 'Lancer la recherche',
    direct: 'Vous avez déjà un vendeur ? Démarrez un accord direct',
    requestsTitle: 'Vos demandes',
    requestsEmpty: 'Aucune demande pour le moment.',
    requestsError: 'Vos demandes ne se sont pas chargées. Réessayez.',
    errors: {
      need: 'Utilisez de 5 à 500 caractères.',
      budget: 'Saisissez un montant supérieur à 0.',
      when: 'Saisissez de 1 à 90 jours.',
      room: 'Saisissez de 0 à 50.',
      split: 'Utilisez 2 à 5 parts qui totalisent 100.',
    },
  },
  sheet: {
    requestTitle: 'Lancer la recherche',
    offerTitle: 'Publier une offre',
    requestLead: 'Votre agent cherche un vendeur pour {amount} USDC au plus, sous {days} jours. Il ne paie jamais sans vous.',
    offerLead: 'Votre agent propose {title} à partir de {amount} USDC et enchérit sur les demandes qui correspondent.',
    setupLine: 'Configure vos agents. Une seule fois.',
    moveLine: 'Transfère {amount} USDC vers votre agent acheteur. Vous pouvez le récupérer depuis Compte si vous annulez la demande.',
    needsProfile: 'Complétez d’abord votre profil.',
    finishProfile: 'Compléter le profil',
    needsMoney: 'Ajoutez d’abord {amount} USDC à votre solde.',
    addMoney: 'Ajouter des USDC',
    loading: 'Vérification de votre solde',
    start: 'Lancer la recherche',
    setupStart: 'Configurer et lancer',
    moveStart: 'Transférer {amount} USDC et lancer',
    setupMoveStart: 'Configurer, transférer {amount} USDC et lancer',
    post: 'Publier l’offre',
    setupPost: 'Configurer et publier',
    steps: { setup: 'Configuration des agents', move: 'Transfert de {amount} USDC', post: 'Publication de votre demande', postOffer: 'Publication de votre offre' },
    status: { waiting: 'En attente', running: 'En cours', slow: 'Plus long que d’habitude', done: 'Terminé', failed: 'N’a pas abouti' },
    checkAgain: 'Vérifier à nouveau',
    tryAgain: 'Réessayer',
    close: 'Fermer',
    notPosted: 'Rien n’a été publié.',
    movedStays: 'Les {amount} USDC transférés restent chez votre agent acheteur.',
  },
  request: {
    upTo: 'jusqu’à {amount} USDC',
    aRequest: 'Une demande',
    back: 'Vos demandes',
    backSeller: 'Ventes',
    states: {
      looking: { headline: 'Recherche de vendeurs.', detail: 'Les offres se clôturent peu après la dernière reçue.' },
      offersArriving: { headline: '{count} offres pour l’instant.', detail: 'Votre agent les compare.' },
      negotiating: { headline: 'Négociation en cours.', detail: 'Votre agent vise votre budget.' },
      closing: { headline: 'Clôture.', detail: 'Le délai est passé. Finalisation en cours.' },
      nearMissYou: { headline: 'Un accord est proche.', detail: 'Ils demandent {price} USDC, hors de votre fourchette.' },
      nearMissThem: { headline: 'Un accord est proche.', detail: 'En attente de l’autre partie.' },
      outOfReach: { headline: 'Aucun vendeur dans votre budget.', detail: 'Modifiez la demande ou reconsidérez le dernier prix.' },
      matchWaitingSellerBuyer: { headline: 'Vendeur trouvé.', detail: 'En attente de l’accord de {name}. Votre agent finance le séquestre dès son accord.' },
      matchWaitingSellerSeller: { headline: 'Un acheteur est intéressé.', detail: 'Acceptez pour lancer l’accord à {price} USDC.' },
      matchRaisedBuyer: { headline: 'Le vendeur demande plus.', detail: '{price} USDC, au lieu de {was} USDC.' },
      matchRaisedOverCap: { headline: 'Le vendeur demande plus que votre budget.', detail: '{price} USDC, au lieu de {was} USDC.' },
      matchRaisedSeller: { headline: 'En attente de l’acheteur.', detail: 'Vous avez demandé {price} USDC.' },
      matchShortBuyer: { headline: 'Vendeur trouvé. Votre agent manque de fonds.', detail: 'Ajoutez {amount} USDC pour financer le séquestre.' },
      matchShortSeller: { headline: 'Vendeur trouvé.', detail: 'En attente des fonds de l’acheteur.' },
      funding: { headline: 'Financement du séquestre.', detail: 'En attente du réseau.' },
      declined: { headline: 'Pas d’accord cette fois.', detail: 'La négociation s’est terminée sans accord.' },
      expired: { headline: 'Demande expirée.', detail: 'Aucun vendeur avant le délai.' },
      cancelled: { headline: 'Demande annulée.', detail: 'Rien n’a été payé.' },
      funded: { headline: 'Séquestre financé.', detail: 'L’accord continue sur sa page.' },
    },
    actions: {
      acceptMatch: 'Accepter',
      raiseMatch: 'Demander plus',
      declineMatch: 'Refuser',
      acceptRaise: 'Accepter {price} USDC',
      declineRaise: 'Refuser',
      addFunds: 'Ajouter {amount} USDC',
      proceedNearMiss: 'Continuer à {price} USDC',
      declineNearMiss: 'Passer',
      openDeal: 'Ouvrir l’accord',
      reconsider: 'Reconsidérer {price} USDC',
    },
    match: { was: 'au lieu de {was} USDC' },
    raise: { label: 'Votre prix', send: 'Envoyer', cancel: 'Annuler' },
    offers: { title: 'Offres reçues ({count})', skill: 'Compétences {pct} %', show: 'Afficher', hide: 'Masquer', unnamed: 'Un vendeur' },
    timeline: 'Ce que votre agent a fait',
    error: 'Cela n’a pas abouti. Réessayez.',
  },
  seller: {
    title: 'Ventes',
    needsYou: 'À traiter',
    bidding: 'Votre agent enchérit sur',
    offers: 'Vos offres',
    post: 'Publier une offre',
    accept: 'Accepter',
    states: { offered: 'Proposée', negotiating: 'En négociation', won: 'Remportée', lost: 'Perdue', withdrawn: 'Retirée', expired: 'Expirée' },
    withdraw: 'Retirer',
    withdrawConfirm: 'Confirmer le retrait',
    daysLeft: '{days} jours restants',
    loadError: 'Votre espace de vente ne s’est pas chargé. Réessayez.',
    biddingEmpty: 'Aucune enchère en cours.',
    offersEmpty: 'Aucune offre publiée.',
  },
  offer: {
    title: 'Publier une offre',
    what: 'Ce que vous proposez',
    details: 'Détails',
    price: 'Prix',
    room: 'Marge de négociation',
    roomUnit: '% sous votre prix',
    ttl: 'Visible pendant',
    days: 'jours',
    submit: 'Publier une offre',
    errors: { what: 'Utilisez de 3 à 120 caractères.', details: 'Ajoutez des détails, de 5 à 500 caractères.', price: 'Saisissez un montant supérieur à 0.', room: 'Saisissez de 0 à 50.', ttl: 'Saisissez de 1 à 90 jours.' },
  },
};

const ar: SearchCopy = {
  find: {
    title: 'اعثر لي على بائع',
    need: 'ماذا تحتاج؟',
    budget: 'أقصى مبلغ تدفعه',
    when: 'المدة',
    days: 'أيام',
    moreTerms: 'شروط إضافية',
    room: 'هامش التفاوض',
    roomUnit: '% فوق ميزانيتك',
    split: 'مراحل الدفع',
    provenOnly: 'بائعون موثوقون فقط',
    start: 'ابدأ البحث',
    direct: 'لديك بائع بالفعل؟ ابدأ صفقة مباشرة',
    requestsTitle: 'طلباتك',
    requestsEmpty: 'لا توجد طلبات بعد.',
    requestsError: 'تعذر تحميل طلباتك. حاول مرة أخرى.',
    errors: {
      need: 'استخدم من 5 إلى 500 حرف.',
      budget: 'أدخل مبلغًا أكبر من 0.',
      when: 'أدخل من 1 إلى 90 يومًا.',
      room: 'أدخل من 0 إلى 50.',
      split: 'استخدم من 2 إلى 5 أجزاء مجموعها 100.',
    },
  },
  sheet: {
    requestTitle: 'ابدأ البحث',
    offerTitle: 'انشر عرضًا',
    requestLead: 'يبحث وكيلك عن بائع بحد أقصى {amount} USDC خلال {days} أيام. لا يدفع أبدًا دون موافقتك.',
    offerLead: 'يعرض وكيلك {title} بدءًا من {amount} USDC ويقدم عروضًا على الطلبات المناسبة.',
    setupLine: 'يُعد وكلاءك. مرة واحدة.',
    moveLine: 'ينقل {amount} USDC إلى وكيل الشراء. يمكنك استرجاعها من الحساب إذا ألغيت الطلب.',
    needsProfile: 'أكمل ملفك الشخصي أولًا.',
    finishProfile: 'أكمل الملف',
    needsMoney: 'أضف {amount} USDC إلى رصيدك أولًا.',
    addMoney: 'أضف USDC',
    loading: 'جارٍ التحقق من رصيدك',
    start: 'ابدأ البحث',
    setupStart: 'أعدّ وابدأ',
    moveStart: 'انقل {amount} USDC وابدأ',
    setupMoveStart: 'أعدّ، وانقل {amount} USDC، وابدأ',
    post: 'انشر العرض',
    setupPost: 'أعدّ وانشر',
    steps: { setup: 'إعداد الوكلاء', move: 'نقل {amount} USDC', post: 'نشر طلبك', postOffer: 'نشر عرضك' },
    status: { waiting: 'في الانتظار', running: 'قيد التنفيذ', slow: 'يستغرق وقتًا أطول من المعتاد', done: 'تم', failed: 'لم يكتمل' },
    checkAgain: 'تحقق مرة أخرى',
    tryAgain: 'حاول مرة أخرى',
    close: 'إغلاق',
    notPosted: 'لم يُنشر شيء.',
    movedStays: 'تبقى {amount} USDC المنقولة لدى وكيل الشراء.',
  },
  request: {
    upTo: 'حتى {amount} USDC',
    aRequest: 'طلب',
    back: 'طلباتك',
    backSeller: 'البيع',
    states: {
      looking: { headline: 'جارٍ البحث عن بائعين.', detail: 'تُغلق العروض بعد وقت قصير من وصول آخرها.' },
      offersArriving: { headline: '{count} عروض حتى الآن.', detail: 'وكيلك يقارن بينها.' },
      negotiating: { headline: 'جارٍ التفاوض.', detail: 'وكيلك يعمل للوصول إلى ميزانيتك.' },
      closing: { headline: 'جارٍ الإغلاق.', detail: 'انتهت المهلة. جارٍ الإنهاء.' },
      nearMissYou: { headline: 'الاتفاق قريب.', detail: 'يطلبون {price} USDC، خارج نطاقك.' },
      nearMissThem: { headline: 'الاتفاق قريب.', detail: 'في انتظار الطرف الآخر.' },
      outOfReach: { headline: 'لا يوجد بائع ضمن ميزانيتك.', detail: 'عدّل الطلب أو أعد النظر في آخر سعر.' },
      matchWaitingSellerBuyer: { headline: 'تم العثور على بائع.', detail: 'في انتظار موافقة {name}. يموّل وكيلك الضمان عند موافقته.' },
      matchWaitingSellerSeller: { headline: 'مشترٍ يريد هذا.', detail: 'وافق لبدء الصفقة بسعر {price} USDC.' },
      matchRaisedBuyer: { headline: 'البائع يطلب أكثر.', detail: '{price} USDC، بدلًا من {was} USDC.' },
      matchRaisedOverCap: { headline: 'البائع يطلب أكثر من ميزانيتك.', detail: '{price} USDC، بدلًا من {was} USDC.' },
      matchRaisedSeller: { headline: 'في انتظار المشتري.', detail: 'طلبت {price} USDC.' },
      matchShortBuyer: { headline: 'تم العثور على بائع. رصيد وكيلك غير كافٍ.', detail: 'أضف {amount} USDC لتمويل الضمان.' },
      matchShortSeller: { headline: 'تم العثور على مشترٍ.', detail: 'في انتظار أن يضيف المشتري الأموال.' },
      funding: { headline: 'جارٍ تمويل الضمان.', detail: 'في انتظار الشبكة.' },
      declined: { headline: 'لا صفقة هذه المرة.', detail: 'انتهى التفاوض دون اتفاق.' },
      expired: { headline: 'انتهت صلاحية الطلب.', detail: 'لم يتم العثور على بائع قبل المهلة.' },
      cancelled: { headline: 'أُلغي الطلب.', detail: 'لم يُدفع شيء.' },
      funded: { headline: 'تم تمويل الضمان.', detail: 'تستمر الصفقة في صفحتها.' },
    },
    actions: {
      acceptMatch: 'اقبل',
      raiseMatch: 'اطلب أكثر',
      declineMatch: 'ارفض',
      acceptRaise: 'اقبل {price} USDC',
      declineRaise: 'ارفض',
      addFunds: 'أضف {amount} USDC',
      proceedNearMiss: 'تابع بسعر {price} USDC',
      declineNearMiss: 'تجاوز',
      openDeal: 'افتح الصفقة',
      reconsider: 'أعد النظر في {price} USDC',
    },
    match: { was: 'بدلًا من {was} USDC' },
    raise: { label: 'سعرك', send: 'أرسل', cancel: 'إلغاء' },
    offers: { title: 'العروض المستلمة ({count})', skill: 'تطابق المهارات {pct}%', show: 'عرض', hide: 'إخفاء', unnamed: 'بائع' },
    timeline: 'ما قام به وكيلك',
    error: 'لم يكتمل ذلك. حاول مرة أخرى.',
  },
  seller: {
    title: 'البيع',
    needsYou: 'بانتظارك',
    bidding: 'يقدم وكيلك عروضًا على',
    offers: 'عروضك',
    post: 'انشر عرضًا',
    accept: 'اقبل',
    states: { offered: 'مُقدَّم', negotiating: 'قيد التفاوض', won: 'فاز', lost: 'خسر', withdrawn: 'مسحوب', expired: 'منتهٍ' },
    withdraw: 'اسحب',
    withdrawConfirm: 'أكّد السحب',
    daysLeft: 'متبقٍ {days} أيام',
    loadError: 'تعذر تحميل مكتب البيع. حاول مرة أخرى.',
    biddingEmpty: 'لا توجد عروض الآن.',
    offersEmpty: 'لا توجد عروض منشورة.',
  },
  offer: {
    title: 'انشر عرضًا',
    what: 'ما تعرضه',
    details: 'التفاصيل',
    price: 'السعر',
    room: 'هامش التفاوض',
    roomUnit: '% أقل من سعرك',
    ttl: 'مدة العرض',
    days: 'أيام',
    submit: 'انشر عرضًا',
    errors: { what: 'استخدم من 3 إلى 120 حرفًا.', details: 'أضف تفاصيل، من 5 إلى 500 حرف.', price: 'أدخل مبلغًا أكبر من 0.', room: 'أدخل من 0 إلى 50.', ttl: 'أدخل من 1 إلى 90 يومًا.' },
  },
};

const hi: SearchCopy = {
  find: {
    title: 'मेरे लिए विक्रेता खोजें',
    need: 'आपको क्या चाहिए?',
    budget: 'अधिकतम भुगतान',
    when: 'समय सीमा',
    days: 'दिन',
    moreTerms: 'और शर्तें',
    room: 'मोलभाव की गुंजाइश',
    roomUnit: '% आपके बजट से ऊपर',
    split: 'भुगतान के चरण',
    provenOnly: 'केवल प्रमाणित विक्रेता',
    start: 'खोज शुरू करें',
    direct: 'पहले से विक्रेता है? सीधा सौदा शुरू करें',
    requestsTitle: 'आपके अनुरोध',
    requestsEmpty: 'अभी कोई अनुरोध नहीं।',
    requestsError: 'आपके अनुरोध लोड नहीं हुए। फिर से कोशिश करें।',
    errors: {
      need: '5 से 500 अक्षर लिखें।',
      budget: '0 से अधिक राशि दर्ज करें।',
      when: '1 से 90 दिन दर्ज करें।',
      room: '0 से 50 दर्ज करें।',
      split: '2 से 5 हिस्से लिखें जिनका जोड़ 100 हो।',
    },
  },
  sheet: {
    requestTitle: 'खोज शुरू करें',
    offerTitle: 'ऑफ़र पोस्ट करें',
    requestLead: 'आपका एजेंट {days} दिनों में अधिकतम {amount} USDC के लिए विक्रेता खोजता है। यह आपके बिना कभी भुगतान नहीं करता।',
    offerLead: 'आपका एजेंट {title} को {amount} USDC से ऑफ़र करता है और उपयुक्त अनुरोधों पर बोली लगाता है।',
    setupLine: 'आपके एजेंट सेट करता है। केवल एक बार।',
    moveLine: '{amount} USDC आपके खरीदार एजेंट में भेजता है। अनुरोध रद्द करने पर आप इसे खाते से वापस ले सकते हैं।',
    needsProfile: 'पहले अपनी प्रोफ़ाइल पूरी करें।',
    finishProfile: 'प्रोफ़ाइल पूरी करें',
    needsMoney: 'पहले अपने बैलेंस में {amount} USDC जोड़ें।',
    addMoney: 'USDC जोड़ें',
    loading: 'आपका बैलेंस जांचा जा रहा है',
    start: 'खोज शुरू करें',
    setupStart: 'सेट करें और शुरू करें',
    moveStart: '{amount} USDC भेजें और शुरू करें',
    setupMoveStart: 'सेट करें, {amount} USDC भेजें और शुरू करें',
    post: 'ऑफ़र पोस्ट करें',
    setupPost: 'सेट करें और पोस्ट करें',
    steps: { setup: 'एजेंट सेट हो रहे हैं', move: '{amount} USDC भेजे जा रहे हैं', post: 'आपका अनुरोध पोस्ट हो रहा है', postOffer: 'आपका ऑफ़र पोस्ट हो रहा है' },
    status: { waiting: 'प्रतीक्षा में', running: 'जारी है', slow: 'सामान्य से अधिक समय लग रहा है', done: 'हो गया', failed: 'पूरा नहीं हुआ' },
    checkAgain: 'फिर से जांचें',
    tryAgain: 'फिर से कोशिश करें',
    close: 'बंद करें',
    notPosted: 'कुछ भी पोस्ट नहीं हुआ।',
    movedStays: 'भेजे गए {amount} USDC आपके खरीदार एजेंट के पास रहते हैं।',
  },
  request: {
    upTo: 'अधिकतम {amount} USDC',
    aRequest: 'एक अनुरोध',
    back: 'आपके अनुरोध',
    backSeller: 'बिक्री',
    states: {
      looking: { headline: 'विक्रेता खोजे जा रहे हैं।', detail: 'आखिरी ऑफ़र आने के कुछ देर बाद ऑफ़र बंद हो जाते हैं।' },
      offersArriving: { headline: 'अब तक {count} ऑफ़र।', detail: 'आपका एजेंट उनकी तुलना कर रहा है।' },
      negotiating: { headline: 'मोलभाव जारी है।', detail: 'आपका एजेंट आपके बजट की ओर काम कर रहा है।' },
      closing: { headline: 'बंद हो रहा है।', detail: 'समय सीमा बीत गई। काम पूरा हो रहा है।' },
      nearMissYou: { headline: 'सौदा करीब है।', detail: 'वे {price} USDC मांग रहे हैं, जो आपकी सीमा से बाहर है।' },
      nearMissThem: { headline: 'सौदा करीब है।', detail: 'दूसरे पक्ष की प्रतीक्षा है।' },
      outOfReach: { headline: 'आपके बजट में कोई विक्रेता नहीं।', detail: 'अनुरोध बदलें या आखिरी कीमत पर फिर विचार करें।' },
      matchWaitingSellerBuyer: { headline: 'विक्रेता मिल गया।', detail: '{name} की स्वीकृति की प्रतीक्षा है। उनके स्वीकार करते ही आपका एजेंट एस्क्रो भरता है।' },
      matchWaitingSellerSeller: { headline: 'एक खरीदार यह चाहता है।', detail: '{price} USDC पर सौदा शुरू करने के लिए स्वीकार करें।' },
      matchRaisedBuyer: { headline: 'विक्रेता अधिक मांग रहा है।', detail: '{price} USDC, पहले {was} USDC।' },
      matchRaisedOverCap: { headline: 'विक्रेता आपके बजट से अधिक मांग रहा है।', detail: '{price} USDC, पहले {was} USDC।' },
      matchRaisedSeller: { headline: 'खरीदार की प्रतीक्षा है।', detail: 'आपने {price} USDC मांगे।' },
      matchShortBuyer: { headline: 'विक्रेता मिल गया। आपके एजेंट में राशि कम है।', detail: 'एस्क्रो भरने के लिए {amount} USDC जोड़ें।' },
      matchShortSeller: { headline: 'खरीदार मिल गया।', detail: 'खरीदार के राशि जोड़ने की प्रतीक्षा है।' },
      funding: { headline: 'एस्क्रो भरा जा रहा है।', detail: 'नेटवर्क की प्रतीक्षा है।' },
      declined: { headline: 'इस बार सौदा नहीं हुआ।', detail: 'मोलभाव बिना सहमति के खत्म हुआ।' },
      expired: { headline: 'अनुरोध की अवधि खत्म।', detail: 'समय सीमा से पहले कोई विक्रेता नहीं मिला।' },
      cancelled: { headline: 'अनुरोध रद्द किया गया।', detail: 'कोई भुगतान नहीं हुआ।' },
      funded: { headline: 'एस्क्रो भर गया।', detail: 'सौदा अपने पेज पर जारी है।' },
    },
    actions: {
      acceptMatch: 'स्वीकार करें',
      raiseMatch: 'अधिक मांगें',
      declineMatch: 'अस्वीकार करें',
      acceptRaise: '{price} USDC स्वीकार करें',
      declineRaise: 'अस्वीकार करें',
      addFunds: '{amount} USDC जोड़ें',
      proceedNearMiss: '{price} USDC पर आगे बढ़ें',
      declineNearMiss: 'छोड़ें',
      openDeal: 'सौदा खोलें',
      reconsider: '{price} USDC पर फिर विचार करें',
    },
    match: { was: 'पहले {was} USDC' },
    raise: { label: 'आपकी कीमत', send: 'भेजें', cancel: 'रद्द करें' },
    offers: { title: 'मिले ऑफ़र ({count})', skill: 'कौशल मेल {pct}%', show: 'दिखाएं', hide: 'छिपाएं', unnamed: 'एक विक्रेता' },
    timeline: 'आपके एजेंट ने क्या किया',
    error: 'यह पूरा नहीं हुआ। फिर से कोशिश करें।',
  },
  seller: {
    title: 'बिक्री',
    needsYou: 'आपकी ज़रूरत है',
    bidding: 'आपका एजेंट इन पर बोली लगा रहा है',
    offers: 'आपके ऑफ़र',
    post: 'ऑफ़र पोस्ट करें',
    accept: 'स्वीकार करें',
    states: { offered: 'पेश किया', negotiating: 'मोलभाव जारी', won: 'जीता', lost: 'हारा', withdrawn: 'वापस लिया', expired: 'समाप्त' },
    withdraw: 'वापस लें',
    withdrawConfirm: 'वापसी की पुष्टि करें',
    daysLeft: '{days} दिन बाकी',
    loadError: 'आपका बिक्री डेस्क लोड नहीं हुआ। फिर से कोशिश करें।',
    biddingEmpty: 'अभी कोई बोली नहीं।',
    offersEmpty: 'कोई ऑफ़र पोस्ट नहीं है।',
  },
  offer: {
    title: 'ऑफ़र पोस्ट करें',
    what: 'आप क्या ऑफ़र करते हैं',
    details: 'विवरण',
    price: 'कीमत',
    room: 'मोलभाव की गुंजाइश',
    roomUnit: '% आपकी कीमत से कम',
    ttl: 'कितने समय तक रहे',
    days: 'दिन',
    submit: 'ऑफ़र पोस्ट करें',
    errors: { what: '3 से 120 अक्षर लिखें।', details: 'विवरण जोड़ें, 5 से 500 अक्षर।', price: '0 से अधिक राशि दर्ज करें।', room: '0 से 50 दर्ज करें।', ttl: '1 से 90 दिन दर्ज करें।' },
  },
};

const sw: SearchCopy = {
  find: {
    title: 'Nitafutie muuzaji',
    need: 'Unahitaji nini?',
    budget: 'Kiasi cha juu utakacholipa',
    when: 'Muda',
    days: 'siku',
    moreTerms: 'Masharti zaidi',
    room: 'Nafasi ya majadiliano',
    roomUnit: '% juu ya bajeti yako',
    split: 'Hatua za malipo',
    provenOnly: 'Wauzaji waliothibitishwa pekee',
    start: 'Anza kutafuta',
    direct: 'Tayari una muuzaji? Anza mkataba wa moja kwa moja',
    requestsTitle: 'Maombi yako',
    requestsEmpty: 'Bado hakuna maombi.',
    requestsError: 'Maombi yako hayakupakia. Jaribu tena.',
    errors: {
      need: 'Tumia herufi 5 hadi 500.',
      budget: 'Weka kiasi zaidi ya 0.',
      when: 'Weka siku 1 hadi 90.',
      room: 'Weka 0 hadi 50.',
      split: 'Tumia sehemu 2 hadi 5 zinazojumlisha 100.',
    },
  },
  sheet: {
    requestTitle: 'Anza kutafuta',
    offerTitle: 'Chapisha ofa',
    requestLead: 'Wakala wako anatafuta muuzaji kwa hadi {amount} USDC, ndani ya siku {days}. Halipi kamwe bila wewe.',
    offerLead: 'Wakala wako anatoa {title} kuanzia {amount} USDC na anaweka zabuni kwenye maombi yanayofaa.',
    setupLine: 'Inaweka mawakala wako. Mara moja tu.',
    moveLine: 'Inahamisha {amount} USDC kwa wakala wako wa kununua. Unaweza kuirudisha kutoka Akaunti ukighairi ombi.',
    needsProfile: 'Kamilisha wasifu wako kwanza.',
    finishProfile: 'Kamilisha wasifu',
    needsMoney: 'Ongeza {amount} USDC kwenye salio lako kwanza.',
    addMoney: 'Ongeza USDC',
    loading: 'Inakagua salio lako',
    start: 'Anza kutafuta',
    setupStart: 'Weka na uanze',
    moveStart: 'Hamisha {amount} USDC na uanze',
    setupMoveStart: 'Weka, hamisha {amount} USDC na uanze',
    post: 'Chapisha ofa',
    setupPost: 'Weka na uchapishe',
    steps: { setup: 'Inaweka mawakala', move: 'Inahamisha {amount} USDC', post: 'Inachapisha ombi lako', postOffer: 'Inachapisha ofa yako' },
    status: { waiting: 'Inasubiri', running: 'Inaendelea', slow: 'Inachukua muda zaidi kuliko kawaida', done: 'Imekamilika', failed: 'Haikufanikiwa' },
    checkAgain: 'Kagua tena',
    tryAgain: 'Jaribu tena',
    close: 'Funga',
    notPosted: 'Hakuna kilichochapishwa.',
    movedStays: '{amount} USDC zilizohamishwa zinabaki kwa wakala wako wa kununua.',
  },
  request: {
    upTo: 'hadi {amount} USDC',
    aRequest: 'Ombi',
    back: 'Maombi yako',
    backSeller: 'Mauzo',
    states: {
      looking: { headline: 'Inatafuta wauzaji.', detail: 'Ofa hufungwa muda mfupi baada ya ya mwisho kufika.' },
      offersArriving: { headline: 'Ofa {count} hadi sasa.', detail: 'Wakala wako anazilinganisha.' },
      negotiating: { headline: 'Majadiliano yanaendelea.', detail: 'Wakala wako anafanya kazi kufikia bajeti yako.' },
      closing: { headline: 'Inafunga.', detail: 'Muda umepita. Inamalizia.' },
      nearMissYou: { headline: 'Makubaliano yako karibu.', detail: 'Wanaomba {price} USDC, nje ya kiwango chako.' },
      nearMissThem: { headline: 'Makubaliano yako karibu.', detail: 'Inasubiri upande mwingine.' },
      outOfReach: { headline: 'Hakuna muuzaji ndani ya bajeti yako.', detail: 'Hariri ombi au fikiria tena bei ya mwisho.' },
      matchWaitingSellerBuyer: { headline: 'Muuzaji amepatikana.', detail: 'Inasubiri {name} akubali. Wakala wako anafadhili escrow wakikubali.' },
      matchWaitingSellerSeller: { headline: 'Mnunuzi anataka hii.', detail: 'Kubali kuanza mkataba kwa {price} USDC.' },
      matchRaisedBuyer: { headline: 'Muuzaji anaomba zaidi.', detail: '{price} USDC, awali {was} USDC.' },
      matchRaisedOverCap: { headline: 'Muuzaji anaomba zaidi ya bajeti yako.', detail: '{price} USDC, awali {was} USDC.' },
      matchRaisedSeller: { headline: 'Inasubiri mnunuzi.', detail: 'Uliomba {price} USDC.' },
      matchShortBuyer: { headline: 'Muuzaji amepatikana. Wakala wako hana pesa za kutosha.', detail: 'Ongeza {amount} USDC ili escrow ifadhiliwe.' },
      matchShortSeller: { headline: 'Mnunuzi amepatikana.', detail: 'Inasubiri mnunuzi aongeze pesa.' },
      funding: { headline: 'Inafadhili escrow.', detail: 'Inasubiri mtandao.' },
      declined: { headline: 'Hakuna mkataba safari hii.', detail: 'Majadiliano yaliisha bila makubaliano.' },
      expired: { headline: 'Ombi limeisha muda.', detail: 'Hakuna muuzaji kabla ya muda kuisha.' },
      cancelled: { headline: 'Ombi limeghairiwa.', detail: 'Hakuna kilicholipwa.' },
      funded: { headline: 'Escrow imefadhiliwa.', detail: 'Mkataba unaendelea kwenye ukurasa wake.' },
    },
    actions: {
      acceptMatch: 'Kubali',
      raiseMatch: 'Omba zaidi',
      declineMatch: 'Kataa',
      acceptRaise: 'Kubali {price} USDC',
      declineRaise: 'Kataa',
      addFunds: 'Ongeza {amount} USDC',
      proceedNearMiss: 'Endelea kwa {price} USDC',
      declineNearMiss: 'Acha',
      openDeal: 'Fungua mkataba',
      reconsider: 'Fikiria tena {price} USDC',
    },
    match: { was: 'awali {was} USDC' },
    raise: { label: 'Bei yako', send: 'Tuma', cancel: 'Ghairi' },
    offers: { title: 'Ofa zilizopokelewa ({count})', skill: 'Ulinganifu wa ujuzi {pct}%', show: 'Onyesha', hide: 'Ficha', unnamed: 'Muuzaji' },
    timeline: 'Wakala wako alichofanya',
    error: 'Hilo halikufanikiwa. Jaribu tena.',
  },
  seller: {
    title: 'Mauzo',
    needsYou: 'Inakuhitaji',
    bidding: 'Wakala wako anaweka zabuni kwenye',
    offers: 'Ofa zako',
    post: 'Chapisha ofa',
    accept: 'Kubali',
    states: { offered: 'Imetolewa', negotiating: 'Majadiliano', won: 'Umeshinda', lost: 'Umeshindwa', withdrawn: 'Imeondolewa', expired: 'Imeisha muda' },
    withdraw: 'Ondoa',
    withdrawConfirm: 'Thibitisha kuondoa',
    daysLeft: 'Siku {days} zimebaki',
    loadError: 'Dawati lako la mauzo halikupakia. Jaribu tena.',
    biddingEmpty: 'Hakuna zabuni sasa.',
    offersEmpty: 'Hakuna ofa zilizochapishwa.',
  },
  offer: {
    title: 'Chapisha ofa',
    what: 'Unachotoa',
    details: 'Maelezo',
    price: 'Bei',
    room: 'Nafasi ya majadiliano',
    roomUnit: '% chini ya bei yako',
    ttl: 'Iwe wazi kwa',
    days: 'siku',
    submit: 'Chapisha ofa',
    errors: { what: 'Tumia herufi 3 hadi 120.', details: 'Ongeza maelezo, herufi 5 hadi 500.', price: 'Weka kiasi zaidi ya 0.', room: 'Weka 0 hadi 50.', ttl: 'Weka siku 1 hadi 90.' },
  },
};

export const searchCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', SearchCopy> = { en, ar, fr, hi, sw };
