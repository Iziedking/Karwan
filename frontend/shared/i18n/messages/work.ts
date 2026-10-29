/// Hourly work and monthly retainers (view 32): a rate, hours logged each week,
/// approved or objected to. Never "engagement", "cycle", "unit" or "escrow".
export interface WorkCopy {
  start: { title: string; body: string };
  form: {
    title: string;
    who: string;
    whoHint: string;
    whoFound: string;
    whoMissing: string;
    whoSelf: string;
    how: string;
    hourly: string;
    monthly: string;
    rate: string;
    rateMonthly: string;
    hours: string;
    weeks: string;
    months: string;
    starts: string;
    startsHint: string;
    what: string;
    brief: string;
    review: string;
  };
  card: { title: string; firstWeek: string; firstMonth: string; fee: string; now: string; mostWeeks: string; mostMonths: string; starts: string; confirm: string; short: string };
  page: {
    rateHour: string;
    rateMonth: string;
    upTo: string;
    weeks: string;
    months: string;
    starts: string;
    hiring: string;
    hiredBy: string;
    status: { offering: string; offered: string; active: string; ending: string; closed: string; cancelled: string; declined: string; failed: string };
    week: string;
    month: string;
    logged: string;
    claimed: string;
    nothingLogged: string;
    paid: string;
    back: string;
    logBy: string;
    reviewBy: string;
    withReview: string;
    notFunded: string;
    accept: string;
    decline: string;
    takeBack: string;
    logHours: string;
    claimMonth: string;
    approve: string;
    approveMonth: string;
    wrong: string;
    fundWeek: string;
    fundMonth: string;
    notice: string;
    endsAfterWeek: string;
    endsAfterMonth: string;
  };
  sheets: {
    approve: { title: string; body: string; gets: string; confirm: string };
    object: { title: string; hours: string; why: string; body: string; confirm: string };
    fund: { title: string; body: string; confirm: string };
    notice: { title: string; body: string; confirm: string };
    accept: { title: string; body: string; confirm: string };
    decline: { title: string; body: string; confirm: string };
    takeBack: { title: string; body: string; confirm: string };
    log: { title: string; hours: string; minutes: string; note: string; confirm: string; claim: string };
  };
  requests: {
    findTitle: string;
    findBody: string;
    form: { title: string; most: string; mostMonthly: string; briefHint: string; starts: string; startsHint: string; post: string };
    market: { title: string; upTo: string; upToMonth: string; closes: string };
    page: {
      status: { open: string; hired: string; closed: string; expired: string };
      offers: string;
      noOffers: string;
      over: string;
      hire: string;
      close: string;
      yourOffer: string;
      yourRate: string;
      yourPrice: string;
      note: string;
      send: string;
      change: string;
      withdraw: string;
      offerStatus: { live: string; withdrawn: string; hired: string; filled: string };
      signIn: string;
      openWork: string;
    };
    hireSheet: { title: string; body: string; confirm: string };
    closeSheet: { title: string; body: string; confirm: string };
  };
  notNow: string;
  failed: string;
}

export const workCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', WorkCopy> = {
  en: {
    start: { title: 'Hire by the hour', body: 'Pay someone by the hour or monthly, one week at a time.' },
    form: {
      title: 'Hire by the hour',
      who: 'Who',
      whoHint: 'Their Karwan tag.',
      whoFound: '{name} · @{tag} on Karwan',
      whoMissing: 'Nobody on Karwan has that tag.',
      whoSelf: 'That is you.',
      how: 'How you pay',
      hourly: 'By the hour',
      monthly: 'Monthly',
      rate: 'Rate per hour, USDC',
      rateMonthly: 'Price per month, USDC',
      hours: 'Most hours a week',
      weeks: 'How many weeks',
      months: 'How many months',
      starts: 'Starts in, days',
      startsHint: 'They accept before it starts, or your money comes back.',
      what: 'What is the work',
      brief: 'Details',
      review: 'Review',
    },
    card: {
      title: 'Check before you pay',
      firstWeek: 'First week, the most it can bill',
      firstMonth: 'First month',
      fee: 'Karwan fee',
      now: 'You pay now',
      mostWeeks: 'The most for all {n} weeks',
      mostMonths: 'The most for all {n} months',
      starts: 'Starts',
      confirm: 'Pay {amount} USDC',
      short: 'Add {amount} USDC to your agent to pay for this.',
    },
    page: {
      rateHour: '{amount} USDC an hour',
      rateMonth: '{amount} USDC a month',
      upTo: 'Up to {n} hours a week',
      weeks: '{n} weeks',
      months: '{n} months',
      starts: 'Starts {date}',
      hiring: 'You are hiring {name}',
      hiredBy: '{name} is hiring you',
      status: { offering: 'On its way', offered: 'Waiting for an answer', active: 'Running', ending: 'Ending', closed: 'Ended', cancelled: 'Taken back', declined: 'Turned down', failed: 'Did not go through' },
      week: 'Week {n}',
      month: 'Month {n}',
      logged: '{hours} of {most} logged',
      claimed: 'Claimed',
      nothingLogged: 'Nothing logged yet',
      paid: '{amount} USDC paid',
      back: '{amount} USDC came back',
      logBy: 'Log by {date}',
      reviewBy: 'Review by {date}',
      withReview: "With Karwan's review team",
      notFunded: 'Not paid for yet',
      accept: 'Accept',
      decline: 'Say no',
      takeBack: 'Take back the offer',
      logHours: 'Log hours',
      claimMonth: 'Claim the month',
      approve: 'Approve {hours}',
      approveMonth: 'Approve the month',
      wrong: 'These hours are wrong',
      fundWeek: 'Pay for week {n}',
      fundMonth: 'Pay for month {n}',
      notice: 'End with notice',
      endsAfterWeek: 'Ends after week {n}',
      endsAfterMonth: 'Ends after month {n}',
    },
    sheets: {
      approve: { title: 'Approve and pay', body: 'They are paid now. This cannot be undone.', gets: 'They receive', confirm: 'Approve and pay' },
      object: { title: 'Which hours are wrong?', hours: 'How many hours', why: 'Why', body: "The rest are paid now. You both have 72 hours to give your side, then Karwan's review team decides.", confirm: 'Send' },
      fund: { title: 'Pay for the next one', body: 'Held until it is settled. Hours not worked come back to you.', confirm: 'Pay {amount} USDC' },
      notice: { title: 'End with notice', body: 'The current one and one more still run. Nothing after that.', confirm: 'Give notice' },
      accept: { title: 'Accept this work', body: 'You agree to these terms. The first one is already paid in.', confirm: 'Accept' },
      decline: { title: 'Say no to this work', body: 'The hirer is told and their money goes back to them.', confirm: 'Say no' },
      takeBack: { title: 'Take back the offer', body: 'They have not accepted yet, so the money comes back to you in full.', confirm: 'Take it back' },
      log: { title: 'Log hours', hours: 'Hours', minutes: 'Minutes', note: 'What you did', confirm: 'Log {hours}', claim: 'Claim the month' },
    },
    requests: {
      findTitle: 'Post it instead',
      findBody: 'No one in mind? Post it, and your agent finds the best fit from what people have done on Karwan.',
      form: { title: 'Post hourly work', most: 'The most per hour, USDC', mostMonthly: 'The most per month, USDC', briefHint: 'Say what the work is, so the right people find it.', starts: 'Starts in, days', startsHint: 'Offers close a day before it starts.', post: 'Post it' },
      market: { title: 'Hourly work', upTo: 'Up to {amount} USDC an hour', upToMonth: 'Up to {amount} USDC a month', closes: 'Offers close {date}' },
      page: {
        status: { open: 'Taking offers', hired: 'Someone was hired', closed: 'Closed', expired: 'Closed, nobody was hired' },
        offers: 'Offers, best fit first',
        noOffers: 'No offers yet. Sellers who fit have been told.',
        over: 'Over your most',
        hire: 'Hire',
        close: 'Close it',
        yourOffer: 'Your offer',
        yourRate: 'Your rate per hour, USDC',
        yourPrice: 'Your price per month, USDC',
        note: 'A short note',
        send: 'Send my offer',
        change: 'Change my offer',
        withdraw: 'Take back my offer',
        offerStatus: { live: 'Sent', withdrawn: 'Taken back', hired: 'You were hired', filled: 'Someone else was hired' },
        signIn: 'Sign in to offer',
        openWork: 'Open the work',
      },
      hireSheet: { title: 'Hire and pay for the first week', body: 'They already agreed these terms, so their agent accepts at once.', confirm: 'Pay {amount} USDC' },
      closeSheet: { title: 'Close this work', body: 'It comes off the market and the people who offered are told.', confirm: 'Close it' },
    },
    notNow: 'Not now',
    failed: 'That did not go through. Try again in a minute.',
  },
  fr: {
    start: { title: "Embaucher à l'heure", body: "Payez quelqu'un à l'heure ou au mois, une semaine à la fois." },
    form: {
      title: "Embaucher à l'heure",
      who: 'Qui',
      whoHint: 'Son identifiant Karwan.',
      whoFound: '{name} · @{tag} sur Karwan',
      whoMissing: "Personne sur Karwan n'a cet identifiant.",
      whoSelf: "C'est vous.",
      how: 'Comment vous payez',
      hourly: "À l'heure",
      monthly: 'Au mois',
      rate: 'Tarif horaire, USDC',
      rateMonthly: 'Prix par mois, USDC',
      hours: 'Heures maximum par semaine',
      weeks: 'Combien de semaines',
      months: 'Combien de mois',
      starts: 'Début dans, jours',
      startsHint: "La personne accepte avant le début, sinon votre argent vous revient.",
      what: 'Quel est le travail',
      brief: 'Détails',
      review: 'Vérifier',
    },
    card: {
      title: 'Vérifiez avant de payer',
      firstWeek: 'Première semaine, le maximum facturable',
      firstMonth: 'Premier mois',
      fee: 'Frais Karwan',
      now: 'Vous payez maintenant',
      mostWeeks: 'Le maximum pour les {n} semaines',
      mostMonths: 'Le maximum pour les {n} mois',
      starts: 'Début',
      confirm: 'Payer {amount} USDC',
      short: 'Ajoutez {amount} USDC à votre agent pour payer.',
    },
    page: {
      rateHour: "{amount} USDC de l'heure",
      rateMonth: '{amount} USDC par mois',
      upTo: "Jusqu'à {n} heures par semaine",
      weeks: '{n} semaines',
      months: '{n} mois',
      starts: 'Début le {date}',
      hiring: 'Vous embauchez {name}',
      hiredBy: '{name} vous embauche',
      status: { offering: 'En cours', offered: 'En attente de réponse', active: 'En cours', ending: 'Se termine', closed: 'Terminé', cancelled: 'Repris', declined: 'Refusé', failed: "N'a pas abouti" },
      week: 'Semaine {n}',
      month: 'Mois {n}',
      logged: '{hours} sur {most} déclarées',
      claimed: 'Déclaré',
      nothingLogged: 'Rien de déclaré',
      paid: '{amount} USDC payés',
      back: '{amount} USDC sont revenus',
      logBy: 'À déclarer avant le {date}',
      reviewBy: 'À vérifier avant le {date}',
      withReview: "Chez l'équipe de vérification de Karwan",
      notFunded: 'Pas encore payée',
      accept: 'Accepter',
      decline: 'Refuser',
      takeBack: "Reprendre l'offre",
      logHours: 'Déclarer des heures',
      claimMonth: 'Déclarer le mois',
      approve: 'Approuver {hours}',
      approveMonth: 'Approuver le mois',
      wrong: 'Ces heures sont fausses',
      fundWeek: 'Payer la semaine {n}',
      fundMonth: 'Payer le mois {n}',
      notice: 'Mettre fin avec préavis',
      endsAfterWeek: 'Se termine après la semaine {n}',
      endsAfterMonth: 'Se termine après le mois {n}',
    },
    sheets: {
      approve: { title: 'Approuver et payer', body: 'La personne est payée maintenant. Impossible à annuler.', gets: 'Elle reçoit', confirm: 'Approuver et payer' },
      object: { title: 'Quelles heures sont fausses ?', hours: "Combien d'heures", why: 'Pourquoi', body: "Le reste est payé maintenant. Vous avez chacun 72 heures pour donner votre version, puis l'équipe de vérification de Karwan décide.", confirm: 'Envoyer' },
      fund: { title: 'Payer la suivante', body: 'Conservé jusqu’au règlement. Les heures non travaillées vous reviennent.', confirm: 'Payer {amount} USDC' },
      notice: { title: 'Mettre fin avec préavis', body: "La période en cours et une de plus continuent. Rien après.", confirm: 'Donner le préavis' },
      accept: { title: 'Accepter ce travail', body: 'Vous acceptez ces conditions. La première période est déjà payée.', confirm: 'Accepter' },
      decline: { title: 'Refuser ce travail', body: "L'employeur est prévenu et son argent lui revient.", confirm: 'Refuser' },
      takeBack: { title: "Reprendre l'offre", body: "La personne n'a pas encore accepté, l'argent vous revient en entier.", confirm: 'Reprendre' },
      log: { title: 'Déclarer des heures', hours: 'Heures', minutes: 'Minutes', note: 'Ce que vous avez fait', confirm: 'Déclarer {hours}', claim: 'Déclarer le mois' },
    },
    requests: {
      findTitle: 'Publiez plutôt',
      findBody: "Personne en tête ? Publiez, et votre agent trouve la meilleure personne d'après ce qu'elle a fait sur Karwan.",
      form: { title: "Publier un travail à l'heure", most: "Le maximum par heure, USDC", mostMonthly: 'Le maximum par mois, USDC', briefHint: 'Dites quel est le travail, pour que les bonnes personnes le trouvent.', starts: 'Début dans, jours', startsHint: 'Les offres se ferment la veille du début.', post: 'Publier' },
      market: { title: "Travail à l'heure", upTo: "Jusqu'à {amount} USDC de l'heure", upToMonth: "Jusqu'à {amount} USDC par mois", closes: 'Offres jusqu’au {date}' },
      page: {
        status: { open: 'Reçoit des offres', hired: 'Quelqu’un a été embauché', closed: 'Fermé', expired: 'Fermé, personne embauché' },
        offers: "Offres, les plus adaptées d'abord",
        noOffers: "Pas encore d'offres. Les vendeurs adaptés ont été prévenus.",
        over: 'Au-dessus de votre maximum',
        hire: 'Embaucher',
        close: 'Fermer',
        yourOffer: 'Votre offre',
        yourRate: 'Votre tarif horaire, USDC',
        yourPrice: 'Votre prix par mois, USDC',
        note: 'Une courte note',
        send: 'Envoyer mon offre',
        change: 'Modifier mon offre',
        withdraw: 'Retirer mon offre',
        offerStatus: { live: 'Envoyée', withdrawn: 'Retirée', hired: 'Vous avez été embauché', filled: "Quelqu'un d'autre a été embauché" },
        signIn: 'Connectez-vous pour faire une offre',
        openWork: 'Ouvrir le travail',
      },
      hireSheet: { title: 'Embaucher et payer la première semaine', body: 'La personne a déjà accepté ces conditions, son agent accepte tout de suite.', confirm: 'Payer {amount} USDC' },
      closeSheet: { title: 'Fermer ce travail', body: 'Il quitte le marché et les personnes qui ont fait une offre sont prévenues.', confirm: 'Fermer' },
    },
    notNow: 'Pas maintenant',
    failed: "Cela n'a pas abouti. Réessayez dans une minute.",
  },
  ar: {
    start: { title: 'التوظيف بالساعة', body: 'ادفع لشخص بالساعة أو شهرياً، أسبوعاً بأسبوع.' },
    form: {
      title: 'التوظيف بالساعة',
      who: 'من',
      whoHint: 'معرّفه على Karwan.',
      whoFound: '{name} · @{tag} على Karwan',
      whoMissing: 'لا أحد على Karwan بهذا المعرّف.',
      whoSelf: 'هذا أنت.',
      how: 'طريقة الدفع',
      hourly: 'بالساعة',
      monthly: 'شهرياً',
      rate: 'السعر للساعة، USDC',
      rateMonthly: 'السعر للشهر، USDC',
      hours: 'أقصى عدد ساعات في الأسبوع',
      weeks: 'كم أسبوعاً',
      months: 'كم شهراً',
      starts: 'يبدأ بعد، بالأيام',
      startsHint: 'يقبل قبل البدء، وإلا يعود إليك مالك.',
      what: 'ما هو العمل',
      brief: 'التفاصيل',
      review: 'مراجعة',
    },
    card: {
      title: 'تحقق قبل الدفع',
      firstWeek: 'الأسبوع الأول، أقصى ما يمكن احتسابه',
      firstMonth: 'الشهر الأول',
      fee: 'رسوم Karwan',
      now: 'تدفع الآن',
      mostWeeks: 'الحد الأقصى لكل الأسابيع الـ{n}',
      mostMonths: 'الحد الأقصى لكل الأشهر الـ{n}',
      starts: 'يبدأ',
      confirm: 'ادفع {amount} USDC',
      short: 'أضف {amount} USDC إلى وكيلك لتدفع.',
    },
    page: {
      rateHour: '{amount} USDC للساعة',
      rateMonth: '{amount} USDC للشهر',
      upTo: 'حتى {n} ساعة في الأسبوع',
      weeks: '{n} أسابيع',
      months: '{n} أشهر',
      starts: 'يبدأ {date}',
      hiring: 'أنت توظّف {name}',
      hiredBy: '{name} يوظّفك',
      status: { offering: 'قيد الإرسال', offered: 'بانتظار الرد', active: 'جارٍ', ending: 'ينتهي', closed: 'انتهى', cancelled: 'تم استرجاعه', declined: 'مرفوض', failed: 'لم يتم' },
      week: 'الأسبوع {n}',
      month: 'الشهر {n}',
      logged: 'سُجّل {hours} من {most}',
      claimed: 'تمت المطالبة',
      nothingLogged: 'لم يُسجّل شيء بعد',
      paid: 'دُفع {amount} USDC',
      back: 'عاد {amount} USDC',
      logBy: 'سجّل قبل {date}',
      reviewBy: 'راجع قبل {date}',
      withReview: 'لدى فريق المراجعة في Karwan',
      notFunded: 'لم يُدفع بعد',
      accept: 'قبول',
      decline: 'رفض',
      takeBack: 'استرجاع العرض',
      logHours: 'تسجيل الساعات',
      claimMonth: 'المطالبة بالشهر',
      approve: 'الموافقة على {hours}',
      approveMonth: 'الموافقة على الشهر',
      wrong: 'هذه الساعات غير صحيحة',
      fundWeek: 'ادفع الأسبوع {n}',
      fundMonth: 'ادفع الشهر {n}',
      notice: 'إنهاء بإشعار',
      endsAfterWeek: 'ينتهي بعد الأسبوع {n}',
      endsAfterMonth: 'ينتهي بعد الشهر {n}',
    },
    sheets: {
      approve: { title: 'الموافقة والدفع', body: 'يُدفع له الآن. لا يمكن التراجع عن ذلك.', gets: 'يحصل على', confirm: 'الموافقة والدفع' },
      object: { title: 'أي الساعات غير صحيحة؟', hours: 'كم ساعة', why: 'لماذا', body: 'يُدفع الباقي الآن. لكل منكما 72 ساعة لعرض روايته، ثم يقرر فريق المراجعة في Karwan.', confirm: 'إرسال' },
      fund: { title: 'ادفع الفترة التالية', body: 'يُحتجز حتى التسوية. تعود إليك الساعات غير المعمولة.', confirm: 'ادفع {amount} USDC' },
      notice: { title: 'إنهاء بإشعار', body: 'تستمر الفترة الحالية وفترة أخرى. لا شيء بعد ذلك.', confirm: 'تقديم الإشعار' },
      accept: { title: 'قبول هذا العمل', body: 'توافق على هذه الشروط. الفترة الأولى مدفوعة بالفعل.', confirm: 'قبول' },
      decline: { title: 'رفض هذا العمل', body: 'يُبلّغ صاحب العمل ويعود إليه ماله.', confirm: 'رفض' },
      takeBack: { title: 'استرجاع العرض', body: 'لم يقبل بعد، لذا يعود إليك المال كاملاً.', confirm: 'استرجاع' },
      log: { title: 'تسجيل الساعات', hours: 'الساعات', minutes: 'الدقائق', note: 'ما الذي أنجزته', confirm: 'سجّل {hours}', claim: 'المطالبة بالشهر' },
    },
    requests: {
      findTitle: 'انشره بدلاً من ذلك',
      findBody: 'لا يوجد شخص في بالك؟ انشره، ويجد وكيلك الأنسب مما أنجزه الناس على Karwan.',
      form: { title: 'نشر عمل بالساعة', most: 'الحد الأقصى للساعة، USDC', mostMonthly: 'الحد الأقصى للشهر، USDC', briefHint: 'قل ما هو العمل، ليجده الأشخاص المناسبون.', starts: 'يبدأ بعد، بالأيام', startsHint: 'تُغلق العروض قبل يوم من البدء.', post: 'انشر' },
      market: { title: 'عمل بالساعة', upTo: 'حتى {amount} USDC للساعة', upToMonth: 'حتى {amount} USDC للشهر', closes: 'تُغلق العروض {date}' },
      page: {
        status: { open: 'يستقبل العروض', hired: 'تم توظيف شخص', closed: 'مغلق', expired: 'مغلق، لم يُوظَّف أحد' },
        offers: 'العروض، الأنسب أولاً',
        noOffers: 'لا عروض بعد. تم إبلاغ البائعين المناسبين.',
        over: 'أعلى من حدك الأقصى',
        hire: 'وظّف',
        close: 'أغلقه',
        yourOffer: 'عرضك',
        yourRate: 'سعرك للساعة، USDC',
        yourPrice: 'سعرك للشهر، USDC',
        note: 'ملاحظة قصيرة',
        send: 'أرسل عرضي',
        change: 'غيّر عرضي',
        withdraw: 'اسحب عرضي',
        offerStatus: { live: 'أُرسل', withdrawn: 'سُحب', hired: 'تم توظيفك', filled: 'تم توظيف شخص آخر' },
        signIn: 'سجّل الدخول لتقدّم عرضاً',
        openWork: 'افتح العمل',
      },
      hireSheet: { title: 'وظّف وادفع الأسبوع الأول', body: 'وافق بالفعل على هذه الشروط، لذا يقبل وكيله فوراً.', confirm: 'ادفع {amount} USDC' },
      closeSheet: { title: 'أغلق هذا العمل', body: 'يُزال من السوق ويُبلّغ من قدّموا عروضاً.', confirm: 'أغلقه' },
    },
    notNow: 'ليس الآن',
    failed: 'لم يتم ذلك. حاول مرة أخرى بعد دقيقة.',
  },
  hi: {
    start: { title: 'घंटे के हिसाब से काम पर रखें', body: 'किसी को घंटे या महीने के हिसाब से भुगतान करें, एक हफ़्ता एक बार में।' },
    form: {
      title: 'घंटे के हिसाब से काम पर रखें',
      who: 'किसे',
      whoHint: 'उनका Karwan टैग।',
      whoFound: '{name} · Karwan पर @{tag}',
      whoMissing: 'Karwan पर इस टैग वाला कोई नहीं है।',
      whoSelf: 'यह आप हैं।',
      how: 'आप कैसे भुगतान करेंगे',
      hourly: 'घंटे के हिसाब से',
      monthly: 'मासिक',
      rate: 'प्रति घंटा दर, USDC',
      rateMonthly: 'प्रति माह कीमत, USDC',
      hours: 'हफ़्ते में अधिकतम घंटे',
      weeks: 'कितने हफ़्ते',
      months: 'कितने महीने',
      starts: 'कितने दिनों में शुरू',
      startsHint: 'वे शुरू होने से पहले स्वीकार करें, नहीं तो आपका पैसा लौट आता है।',
      what: 'काम क्या है',
      brief: 'विवरण',
      review: 'जाँचें',
    },
    card: {
      title: 'भुगतान से पहले जाँचें',
      firstWeek: 'पहला हफ़्ता, अधिकतम बिल',
      firstMonth: 'पहला महीना',
      fee: 'Karwan शुल्क',
      now: 'आप अभी भुगतान करते हैं',
      mostWeeks: 'सभी {n} हफ़्तों के लिए अधिकतम',
      mostMonths: 'सभी {n} महीनों के लिए अधिकतम',
      starts: 'शुरुआत',
      confirm: '{amount} USDC भुगतान करें',
      short: 'भुगतान के लिए अपने एजेंट में {amount} USDC जोड़ें।',
    },
    page: {
      rateHour: '{amount} USDC प्रति घंटा',
      rateMonth: '{amount} USDC प्रति माह',
      upTo: 'हफ़्ते में {n} घंटे तक',
      weeks: '{n} हफ़्ते',
      months: '{n} महीने',
      starts: '{date} से शुरू',
      hiring: 'आप {name} को काम पर रख रहे हैं',
      hiredBy: '{name} आपको काम पर रख रहे हैं',
      status: { offering: 'भेजा जा रहा है', offered: 'जवाब का इंतज़ार', active: 'चल रहा है', ending: 'खत्म हो रहा है', closed: 'खत्म', cancelled: 'वापस लिया गया', declined: 'मना किया गया', failed: 'नहीं हो पाया' },
      week: 'हफ़्ता {n}',
      month: 'महीना {n}',
      logged: '{most} में से {hours} दर्ज',
      claimed: 'दावा किया गया',
      nothingLogged: 'अभी कुछ दर्ज नहीं',
      paid: '{amount} USDC भुगतान हुआ',
      back: '{amount} USDC वापस आया',
      logBy: '{date} तक दर्ज करें',
      reviewBy: '{date} तक जाँचें',
      withReview: 'Karwan की समीक्षा टीम के पास',
      notFunded: 'अभी भुगतान नहीं हुआ',
      accept: 'स्वीकार करें',
      decline: 'मना करें',
      takeBack: 'प्रस्ताव वापस लें',
      logHours: 'घंटे दर्ज करें',
      claimMonth: 'महीने का दावा करें',
      approve: '{hours} स्वीकृत करें',
      approveMonth: 'महीना स्वीकृत करें',
      wrong: 'ये घंटे गलत हैं',
      fundWeek: 'हफ़्ता {n} का भुगतान करें',
      fundMonth: 'महीना {n} का भुगतान करें',
      notice: 'नोटिस देकर खत्म करें',
      endsAfterWeek: 'हफ़्ता {n} के बाद खत्म',
      endsAfterMonth: 'महीना {n} के बाद खत्म',
    },
    sheets: {
      approve: { title: 'स्वीकृत करें और भुगतान करें', body: 'उन्हें अभी भुगतान होता है। इसे वापस नहीं लिया जा सकता।', gets: 'उन्हें मिलता है', confirm: 'स्वीकृत करें और भुगतान करें' },
      object: { title: 'कौन से घंटे गलत हैं?', hours: 'कितने घंटे', why: 'क्यों', body: 'बाकी का भुगतान अभी होता है। आप दोनों के पास अपनी बात रखने के लिए 72 घंटे हैं, फिर Karwan की समीक्षा टीम तय करती है।', confirm: 'भेजें' },
      fund: { title: 'अगले का भुगतान करें', body: 'निपटारे तक रखा जाता है। बिना काम के घंटे आपको वापस मिलते हैं।', confirm: '{amount} USDC भुगतान करें' },
      notice: { title: 'नोटिस देकर खत्म करें', body: 'मौजूदा और एक और अवधि चलती है। उसके बाद कुछ नहीं।', confirm: 'नोटिस दें' },
      accept: { title: 'यह काम स्वीकार करें', body: 'आप इन शर्तों से सहमत हैं। पहली अवधि का भुगतान हो चुका है।', confirm: 'स्वीकार करें' },
      decline: { title: 'यह काम मना करें', body: 'काम देने वाले को बताया जाता है और उनका पैसा लौट जाता है।', confirm: 'मना करें' },
      takeBack: { title: 'प्रस्ताव वापस लें', body: 'उन्होंने अभी स्वीकार नहीं किया, इसलिए पूरा पैसा आपको वापस मिलता है।', confirm: 'वापस लें' },
      log: { title: 'घंटे दर्ज करें', hours: 'घंटे', minutes: 'मिनट', note: 'आपने क्या किया', confirm: '{hours} दर्ज करें', claim: 'महीने का दावा करें' },
    },
    requests: {
      findTitle: 'इसके बजाय पोस्ट करें',
      findBody: 'कोई ध्यान में नहीं? पोस्ट करें, और आपका एजेंट Karwan पर लोगों के किए काम से सबसे सही व्यक्ति ढूँढता है।',
      form: { title: 'घंटे के हिसाब से काम पोस्ट करें', most: 'प्रति घंटा अधिकतम, USDC', mostMonthly: 'प्रति माह अधिकतम, USDC', briefHint: 'बताएँ काम क्या है, ताकि सही लोग इसे ढूँढें।', starts: 'कितने दिनों में शुरू', startsHint: 'शुरू होने से एक दिन पहले प्रस्ताव बंद हो जाते हैं।', post: 'पोस्ट करें' },
      market: { title: 'घंटे के हिसाब से काम', upTo: '{amount} USDC प्रति घंटा तक', upToMonth: '{amount} USDC प्रति माह तक', closes: 'प्रस्ताव {date} को बंद' },
      page: {
        status: { open: 'प्रस्ताव ले रहे हैं', hired: 'किसी को काम पर रखा गया', closed: 'बंद', expired: 'बंद, किसी को नहीं रखा गया' },
        offers: 'प्रस्ताव, सबसे सही पहले',
        noOffers: 'अभी कोई प्रस्ताव नहीं। सही विक्रेताओं को बताया गया है।',
        over: 'आपकी अधिकतम सीमा से ऊपर',
        hire: 'काम पर रखें',
        close: 'बंद करें',
        yourOffer: 'आपका प्रस्ताव',
        yourRate: 'आपकी प्रति घंटा दर, USDC',
        yourPrice: 'आपकी प्रति माह कीमत, USDC',
        note: 'एक छोटा नोट',
        send: 'मेरा प्रस्ताव भेजें',
        change: 'मेरा प्रस्ताव बदलें',
        withdraw: 'मेरा प्रस्ताव वापस लें',
        offerStatus: { live: 'भेजा गया', withdrawn: 'वापस लिया गया', hired: 'आपको काम पर रखा गया', filled: 'किसी और को रखा गया' },
        signIn: 'प्रस्ताव देने के लिए साइन इन करें',
        openWork: 'काम खोलें',
      },
      hireSheet: { title: 'काम पर रखें और पहले हफ़्ते का भुगतान करें', body: 'वे इन शर्तों पर पहले ही सहमत हैं, इसलिए उनका एजेंट तुरंत स्वीकार करता है।', confirm: '{amount} USDC भुगतान करें' },
      closeSheet: { title: 'यह काम बंद करें', body: 'यह बाज़ार से हट जाता है और प्रस्ताव देने वालों को बताया जाता है।', confirm: 'बंद करें' },
    },
    notNow: 'अभी नहीं',
    failed: 'यह नहीं हो पाया। एक मिनट में फिर कोशिश करें।',
  },
  sw: {
    start: { title: 'Ajiri kwa saa', body: 'Mlipe mtu kwa saa au kwa mwezi, wiki moja kwa wakati.' },
    form: {
      title: 'Ajiri kwa saa',
      who: 'Nani',
      whoHint: 'Lebo yake ya Karwan.',
      whoFound: '{name} · @{tag} kwenye Karwan',
      whoMissing: 'Hakuna mtu kwenye Karwan mwenye lebo hiyo.',
      whoSelf: 'Huyo ni wewe.',
      how: 'Unavyolipa',
      hourly: 'Kwa saa',
      monthly: 'Kwa mwezi',
      rate: 'Kiwango kwa saa, USDC',
      rateMonthly: 'Bei kwa mwezi, USDC',
      hours: 'Saa nyingi zaidi kwa wiki',
      weeks: 'Wiki ngapi',
      months: 'Miezi mingapi',
      starts: 'Inaanza baada ya, siku',
      startsHint: 'Wanakubali kabla haijaanza, la sivyo pesa yako inarudi.',
      what: 'Kazi ni ipi',
      brief: 'Maelezo',
      review: 'Kagua',
    },
    card: {
      title: 'Kagua kabla ya kulipa',
      firstWeek: 'Wiki ya kwanza, kiwango cha juu cha kutoza',
      firstMonth: 'Mwezi wa kwanza',
      fee: 'Ada ya Karwan',
      now: 'Unalipa sasa',
      mostWeeks: 'Kiwango cha juu kwa wiki zote {n}',
      mostMonths: 'Kiwango cha juu kwa miezi yote {n}',
      starts: 'Inaanza',
      confirm: 'Lipa USDC {amount}',
      short: 'Ongeza USDC {amount} kwa wakala wako ili ulipe.',
    },
    page: {
      rateHour: 'USDC {amount} kwa saa',
      rateMonth: 'USDC {amount} kwa mwezi',
      upTo: 'Hadi saa {n} kwa wiki',
      weeks: 'Wiki {n}',
      months: 'Miezi {n}',
      starts: 'Inaanza {date}',
      hiring: 'Unamwajiri {name}',
      hiredBy: '{name} anakuajiri',
      status: { offering: 'Inatumwa', offered: 'Inasubiri jibu', active: 'Inaendelea', ending: 'Inaisha', closed: 'Imeisha', cancelled: 'Imerudishwa', declined: 'Imekataliwa', failed: 'Haikufanikiwa' },
      week: 'Wiki {n}',
      month: 'Mwezi {n}',
      logged: '{hours} kati ya {most} zimeandikwa',
      claimed: 'Umedaiwa',
      nothingLogged: 'Hakuna kilichoandikwa bado',
      paid: 'USDC {amount} zimelipwa',
      back: 'USDC {amount} zimerudi',
      logBy: 'Andika kabla ya {date}',
      reviewBy: 'Kagua kabla ya {date}',
      withReview: 'Kwa timu ya ukaguzi ya Karwan',
      notFunded: 'Bado haijalipiwa',
      accept: 'Kubali',
      decline: 'Kataa',
      takeBack: 'Rudisha ofa',
      logHours: 'Andika saa',
      claimMonth: 'Dai mwezi',
      approve: 'Idhinisha {hours}',
      approveMonth: 'Idhinisha mwezi',
      wrong: 'Saa hizi si sahihi',
      fundWeek: 'Lipia wiki {n}',
      fundMonth: 'Lipia mwezi {n}',
      notice: 'Maliza kwa notisi',
      endsAfterWeek: 'Inaisha baada ya wiki {n}',
      endsAfterMonth: 'Inaisha baada ya mwezi {n}',
    },
    sheets: {
      approve: { title: 'Idhinisha na ulipe', body: 'Wanalipwa sasa. Hili haliwezi kutenduliwa.', gets: 'Wanapokea', confirm: 'Idhinisha na ulipe' },
      object: { title: 'Saa zipi si sahihi?', hours: 'Saa ngapi', why: 'Kwa nini', body: 'Zilizobaki zinalipwa sasa. Nyote mna saa 72 kueleza upande wenu, kisha timu ya ukaguzi ya Karwan inaamua.', confirm: 'Tuma' },
      fund: { title: 'Lipia inayofuata', body: 'Inashikiliwa hadi ilipwe. Saa ambazo hazikufanyiwa kazi zinarudi kwako.', confirm: 'Lipa USDC {amount}' },
      notice: { title: 'Maliza kwa notisi', body: 'Kipindi cha sasa na kingine kimoja vinaendelea. Hakuna baada ya hapo.', confirm: 'Toa notisi' },
      accept: { title: 'Kubali kazi hii', body: 'Unakubali masharti haya. Kipindi cha kwanza tayari kimelipiwa.', confirm: 'Kubali' },
      decline: { title: 'Kataa kazi hii', body: 'Mwajiri anaambiwa na pesa yake inarudi kwake.', confirm: 'Kataa' },
      takeBack: { title: 'Rudisha ofa', body: 'Bado hawajakubali, kwa hivyo pesa yote inarudi kwako.', confirm: 'Rudisha' },
      log: { title: 'Andika saa', hours: 'Saa', minutes: 'Dakika', note: 'Ulichofanya', confirm: 'Andika {hours}', claim: 'Dai mwezi' },
    },
    requests: {
      findTitle: 'Badala yake ichapishe',
      findBody: 'Huna mtu akilini? Ichapishe, na wakala wako atampata anayefaa zaidi kutokana na kazi watu walizofanya kwenye Karwan.',
      form: { title: 'Chapisha kazi ya saa', most: 'Kiwango cha juu kwa saa, USDC', mostMonthly: 'Kiwango cha juu kwa mwezi, USDC', briefHint: 'Eleza kazi ni ipi, ili watu sahihi waipate.', starts: 'Inaanza baada ya, siku', startsHint: 'Ofa zinafungwa siku moja kabla ya kuanza.', post: 'Ichapishe' },
      market: { title: 'Kazi ya saa', upTo: 'Hadi USDC {amount} kwa saa', upToMonth: 'Hadi USDC {amount} kwa mwezi', closes: 'Ofa zinafungwa {date}' },
      page: {
        status: { open: 'Inapokea ofa', hired: 'Mtu ameajiriwa', closed: 'Imefungwa', expired: 'Imefungwa, hakuna aliyeajiriwa' },
        offers: 'Ofa, anayefaa zaidi kwanza',
        noOffers: 'Bado hakuna ofa. Wauzaji wanaofaa wameambiwa.',
        over: 'Zaidi ya kiwango chako cha juu',
        hire: 'Ajiri',
        close: 'Ifunge',
        yourOffer: 'Ofa yako',
        yourRate: 'Kiwango chako kwa saa, USDC',
        yourPrice: 'Bei yako kwa mwezi, USDC',
        note: 'Ujumbe mfupi',
        send: 'Tuma ofa yangu',
        change: 'Badilisha ofa yangu',
        withdraw: 'Rudisha ofa yangu',
        offerStatus: { live: 'Imetumwa', withdrawn: 'Imerudishwa', hired: 'Umeajiriwa', filled: 'Mtu mwingine ameajiriwa' },
        signIn: 'Ingia ili utoe ofa',
        openWork: 'Fungua kazi',
      },
      hireSheet: { title: 'Ajiri na ulipie wiki ya kwanza', body: 'Tayari wamekubali masharti haya, kwa hivyo wakala wao anakubali mara moja.', confirm: 'Lipa USDC {amount}' },
      closeSheet: { title: 'Funga kazi hii', body: 'Inaondoka sokoni na waliotoa ofa wanaambiwa.', confirm: 'Ifunge' },
    },
    notNow: 'Si sasa',
    failed: 'Haikufanikiwa. Jaribu tena baada ya dakika moja.',
  },
};
