/// Contests (view 40): a prize held from the start, entries from sellers, the
/// buyer picks one to eight winners (view 88). Never "escrow" or "evaluator";
/// "bounty" only in the name of a bug bounty, the kind people know.
export interface ContestsCopy {
  start: { title: string; body: string };
  market: { title: string; prize: string; winnersOne: string; winnersMany: string; entries: string; closes: string };
  form: {
    title: string;
    what: string;
    brief: string;
    briefHint: string;
    prize: string;
    places: string;
    kind: string;
    kinds: { design: string; bugs: string; hackathon: string };
    placesOf: string;
    fewer: string;
    more: string;
    split: string;
    splits: { suggested: string; equal: string; own: string };
    splitHint: string;
    placeAmount: string;
    addsUp: string;
    left: string;
    over: string;
    days: string;
    daysHint: string;
    judge: string;
    judgeHint: string;
    dayUnit: string;
    review: string;
  };
  card: {
    title: string; prize: string; fee: string; total: string; placeGets: string[]; closes: string; pickBy: string; confirm: string; short: string;
    judgingEnds: string; ifNobody: string; paidOut: string;
  };
  page: {
    closes: string;
    pickBy: string;
    status: { opening: string; open: string; awarding: string; awarded: string; cancelled: string; returned: string; failed: string };
    brief: string;
    entries: string;
    noEntries: string;
    pick: string;
    pickHint: string;
    places: string[];
    pay: string;
    takeBack: string;
    signIn: string;
    yours: string;
    yourStatus: { entering: string; in: string; won: string; lost: string; failed: string; replaced: string };
    enter: string;
    replace: string;
    note: string;
    files: string;
    filesHint: string;
    closed: string;
    winner: string;
    file: string;
  };
  award: { title: string; body: string; back: string; confirm: string };
  cancel: { title: string; body: string; confirm: string };
  enterSheet: { title: string; body: string; confirm: string };
  /// View 88: contests that protect entrants.
  judging: {
    left: { one: string; many: string };
    phase: { entries: string; judging: string; waiting: string; paidEarliest: string };
    dates: {
      entriesClose: string; entriesClosed: string; judgingEnds: string; judgingEnded: string;
      ifNobody: string; ifYouPickNobody: string; paidOut: string; earliestPaid: string;
    };
    notValid: string;
    marked: string;
    markedBy: string;
    theirReason: string;
    newEntry: string;
    youWon: string;
    withAgent: string;
    placeRow: string;
    picked: string;
    earliest: string;
    ifNobodyHint: string;
  };
  mark: { title: string; why: string; count: string; confirm: string; keep: string; hint: string };
  notNow: string;
  failed: string;
}

export const contestsCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', ContestsCopy> = {
  en: {
    start: { title: 'Run a contest', body: 'Put up a prize, sellers send their work, you pick up to eight winners.' },
    market: { title: 'Contests', prize: '{amount} USDC prize', winnersOne: '1 winner', winnersMany: '{n} winners', entries: '{n} entries', closes: 'Entries close {date}' },
    form: {
      title: 'Run a contest',
      what: 'What it is for',
      brief: 'What you want',
      briefHint: 'Sellers read this before they send their work.',
      prize: 'Prize',
      places: 'Winners',
      kind: 'Kind of contest',
      kinds: { design: 'Design or writing', bugs: 'Bug bounty', hackathon: 'Hackathon' },
      placesOf: 'of {n}',
      fewer: 'One fewer winner',
      more: 'One more winner',
      split: 'How the prize is shared',
      splits: { suggested: 'Suggested', equal: 'Equal', own: 'My own' },
      splitHint: 'Every winner gets a part of the prize. Keep the suggested split, share it equally, or say what each place gets.',
      placeAmount: '{place} place',
      addsUp: 'Adds up to {amount} USDC',
      left: '{amount} USDC left to share',
      over: '{amount} USDC more than the prize',
      days: 'Entries open for',
      daysHint: 'Entries stay open {min} to {max} days.',
      judge: 'You judge for',
      judgeHint: 'You judge for {min} to {max} days after entries close. If you pick nobody, you have 3 more days, then the prize goes to the earliest entries.',
      dayUnit: 'days',
      review: 'Review the contest',
    },
    card: {
      prize: 'Prize',
      fee: 'Karwan fee',
      total: 'You put up',
      placeGets: ['First place gets', 'Second place gets', 'Third place gets', 'Fourth place gets', 'Fifth place gets', 'Sixth place gets', 'Seventh place gets', 'Eighth place gets'],
      title: 'Your contest',
      judgingEnds: 'Judging ends',
      ifNobody: 'If you pick nobody',
      paidOut: 'Paid out {date}',
      closes: 'Entries close',
      pickBy: 'Pick winners by',
      confirm: 'Put up {amount} USDC',
      short: 'Add {amount} USDC to your balance first.',
    },
    page: {
      closes: 'Entries close {date}',
      pickBy: 'Pick winners by {date}',
      status: { opening: 'Opening', open: 'Open for entries', awarding: 'Paying the winners', awarded: 'Winners paid', cancelled: 'Taken back', returned: 'Prize returned', failed: 'Did not open' },
      brief: 'What they want',
      entries: 'Entries',
      noEntries: 'No entries yet.',
      pick: 'Pick the winners',
      pickHint: 'Tap an entry for each place, first place first.',
      places: ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'],
      pay: 'Pay the winners',
      takeBack: 'Take it back',
      signIn: 'Sign in to enter',
      yours: 'Your entry',
      yourStatus: {
        entering: 'Sending your entry.',
        in: 'In. The buyer sees your preview.',
        won: 'You won {amount} USDC.',
        lost: 'Not picked this time.',
        failed: 'It did not go in. Try again.',
        replaced: 'Replaced by your newer entry.',
      },
      enter: 'Enter',
      replace: 'Replace my entry',
      note: 'Note to the buyer',
      files: 'Your work',
      filesHint: 'Images or PDF, up to 4 files of 5 MB. The buyer sees your first image before picking.',
      closed: 'Entries have closed.',
      winner: '{place} place, {amount} USDC',
      file: 'File {n}',
    },
    award: { title: 'Pay the winners', body: 'Each winner is paid now and their full files come to you. This cannot be undone.', back: 'Comes back to you', confirm: 'Pay the winners' },
    cancel: { title: 'Take back the contest', body: 'Nobody has entered, so the prize and the fee come back to your balance.', confirm: 'Take it back' },
    enterSheet: { title: 'Enter this contest', body: 'The buyer sees your first image and your note. Your full files go to them only if you win.', confirm: 'Enter' },
    judging: {
      left: { one: '1 day left', many: '{n} days left' },
      phase: { entries: 'Entries open · {left}', judging: 'Judging · {left}', waiting: 'Waiting for the buyer · {left}', paidEarliest: 'Paid to the earliest entries' },
      dates: { entriesClose: 'Entries close', entriesClosed: 'Entries closed', judgingEnds: 'Judging ends', judgingEnded: 'Judging ended', ifNobody: 'If nobody is picked', ifYouPickNobody: 'If you pick nobody', paidOut: 'Paid out {date}', earliestPaid: 'Earliest entries paid' },
      notValid: 'Not valid',
      marked: 'Marked not valid',
      markedBy: 'Marked by the buyer',
      theirReason: 'Their reason',
      newEntry: 'Send a new entry',
      youWon: 'You won {place} place',
      withAgent: '{amount} USDC is with your selling agent.',
      placeRow: '{place} place',
      picked: 'Picked',
      earliest: 'Earliest entries',
      ifNobodyHint: 'If nobody is picked when judging ends, the buyer has 3 more days. Then the prize goes to the earliest valid entries, in the order they were sent.',
    },
    mark: { title: 'Mark {name}\'s entry not valid', why: 'Why', count: '{n} of 280', confirm: 'Mark not valid', keep: 'Keep it', hint: 'Every entrant can read your reason. A marked entry is never paid, and if you mark every entry the prize comes back to you.' },
    notNow: 'Not now',
    failed: 'That did not go through. Nothing moved.',
  },
  fr: {
    start: { title: 'Lancer un concours', body: 'Mettez un prix en jeu, les vendeurs envoient leur travail, vous choisissez jusqu’à huit gagnants.' },
    market: { title: 'Concours', prize: 'Prix de {amount} USDC', winnersOne: '1 gagnant', winnersMany: '{n} gagnants', entries: '{n} participations', closes: 'Participations jusqu’au {date}' },
    form: {
      title: 'Lancer un concours',
      what: 'Pour quoi',
      brief: 'Ce que vous voulez',
      briefHint: 'Les vendeurs le lisent avant d’envoyer leur travail.',
      prize: 'Prix',
      places: 'Gagnants',
      kind: 'Type de concours',
      kinds: { design: 'Design ou rédaction', bugs: 'Chasse aux bugs', hackathon: 'Hackathon' },
      placesOf: 'sur {n}',
      fewer: 'Un gagnant de moins',
      more: 'Un gagnant de plus',
      split: 'Partage du prix',
      splits: { suggested: 'Suggéré', equal: 'À parts égales', own: 'Le mien' },
      splitHint: 'Chaque gagnant reçoit une part du prix. Gardez le partage suggéré, partagez à parts égales ou fixez la part de chaque place.',
      placeAmount: '{place} place',
      addsUp: 'Total : {amount} USDC',
      left: 'Reste {amount} USDC à partager',
      over: '{amount} USDC de plus que le prix',
      days: 'Participations ouvertes',
      daysHint: 'Les participations restent ouvertes de {min} à {max} jours.',
      judge: 'Vous jugez pendant',
      judgeHint: 'Vous jugez pendant {min} à {max} jours après la clôture. Si vous ne choisissez personne, vous avez 3 jours de plus, puis le prix va aux premières participations.',
      dayUnit: 'jours',
      review: 'Vérifier le concours',
    },
    card: {
      prize: 'Prix',
      fee: 'Frais Karwan',
      total: 'Vous mettez',
      placeGets: ['La première place reçoit', 'La deuxième place reçoit', 'La troisième place reçoit', 'La quatrième place reçoit', 'La cinquième place reçoit', 'La sixième place reçoit', 'La septième place reçoit', 'La huitième place reçoit'],
      title: 'Votre concours',
      judgingEnds: 'Fin du jugement',
      ifNobody: 'Si vous ne choisissez personne',
      paidOut: 'Payé le {date}',
      closes: 'Fin des participations',
      pickBy: 'Choix des gagnants avant le',
      confirm: 'Mettre {amount} USDC',
      short: 'Ajoutez d’abord {amount} USDC à votre solde.',
    },
    page: {
      closes: 'Participations jusqu’au {date}',
      pickBy: 'Choix des gagnants avant le {date}',
      status: { opening: 'Ouverture', open: 'Ouvert aux participations', awarding: 'Paiement des gagnants', awarded: 'Gagnants payés', cancelled: 'Repris', returned: 'Prix rendu', failed: 'Non ouvert' },
      brief: 'Ce qu’il veut',
      entries: 'Participations',
      noEntries: 'Aucune participation pour l’instant.',
      pick: 'Choisir les gagnants',
      pickHint: 'Touchez une participation pour chaque place, la première d’abord.',
      places: ['Première', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième', 'Sixième', 'Septième', 'Huitième'],
      pay: 'Payer les gagnants',
      takeBack: 'Le reprendre',
      signIn: 'Connectez-vous pour participer',
      yours: 'Votre participation',
      yourStatus: {
        entering: 'Envoi de votre participation.',
        in: 'Envoyée. L’acheteur voit votre aperçu.',
        won: 'Vous avez gagné {amount} USDC.',
        lost: 'Pas retenue cette fois.',
        failed: 'Elle n’est pas passée. Réessayez.',
        replaced: 'Remplacée par votre participation plus récente.',
      },
      enter: 'Participer',
      replace: 'Remplacer ma participation',
      note: 'Note pour l’acheteur',
      files: 'Votre travail',
      filesHint: 'Images ou PDF, jusqu’à 4 fichiers de 5 Mo. L’acheteur voit votre première image avant de choisir.',
      closed: 'Les participations sont closes.',
      winner: '{place} place, {amount} USDC',
      file: 'Fichier {n}',
    },
    award: { title: 'Payer les gagnants', body: 'Chaque gagnant est payé maintenant et ses fichiers complets vous parviennent. C’est définitif.', back: 'Vous revient', confirm: 'Payer les gagnants' },
    cancel: { title: 'Reprendre le concours', body: 'Personne n’a participé, le prix et les frais reviennent sur votre solde.', confirm: 'Le reprendre' },
    enterSheet: { title: 'Participer à ce concours', body: 'L’acheteur voit votre première image et votre note. Vos fichiers complets ne lui parviennent que si vous gagnez.', confirm: 'Participer' },
    judging: {
      left: { one: '1 jour restant', many: '{n} jours restants' },
      phase: { entries: 'Participations ouvertes · {left}', judging: 'Jugement · {left}', waiting: 'En attente de l’acheteur · {left}', paidEarliest: 'Payé aux premières participations' },
      dates: { entriesClose: 'Clôture des participations', entriesClosed: 'Participations closes', judgingEnds: 'Fin du jugement', judgingEnded: 'Jugement terminé', ifNobody: 'Si personne n’est choisi', ifYouPickNobody: 'Si vous ne choisissez personne', paidOut: 'Payé le {date}', earliestPaid: 'Premières participations payées' },
      notValid: 'Non valable',
      marked: 'Marquées non valables',
      markedBy: 'Marquée par l’acheteur',
      theirReason: 'Sa raison',
      newEntry: 'Envoyer une nouvelle participation',
      youWon: 'Vous avez gagné la {place} place',
      withAgent: '{amount} USDC sont chez votre agent vendeur.',
      placeRow: '{place} place',
      picked: 'Choisis',
      earliest: 'Premières participations',
      ifNobodyHint: 'Si personne n’est choisi à la fin du jugement, l’acheteur a 3 jours de plus. Ensuite le prix va aux premières participations valables, dans l’ordre d’envoi.',
    },
    mark: { title: 'Marquer la participation de {name} non valable', why: 'Pourquoi', count: '{n} sur 280', confirm: 'Marquer non valable', keep: 'La garder', hint: 'Chaque participant peut lire votre raison. Une participation marquée n’est jamais payée, et si vous les marquez toutes, le prix vous revient.' },
    notNow: 'Pas maintenant',
    failed: 'Cela n’est pas passé. Rien n’a bougé.',
  },
  ar: {
    start: { title: 'أطلق مسابقة', body: 'ضع جائزة، يرسل البائعون أعمالهم، وتختار حتى ثمانية فائزين.' },
    market: { title: 'المسابقات', prize: 'جائزة {amount} USDC', winnersOne: 'فائز واحد', winnersMany: '{n} فائزين', entries: '{n} مشاركات', closes: 'تُغلق المشاركات {date}' },
    form: {
      title: 'أطلق مسابقة',
      what: 'لأي شيء',
      brief: 'ما تريده',
      briefHint: 'يقرأ البائعون هذا قبل إرسال أعمالهم.',
      prize: 'الجائزة',
      places: 'الفائزون',
      kind: 'نوع المسابقة',
      kinds: { design: 'تصميم أو كتابة', bugs: 'اكتشاف الثغرات', hackathon: 'هاكاثون' },
      placesOf: 'من {n}',
      fewer: 'فائز أقل',
      more: 'فائز إضافي',
      split: 'كيف تُقسم الجائزة',
      splits: { suggested: 'المقترح', equal: 'بالتساوي', own: 'تقسيمي' },
      splitHint: 'يحصل كل فائز على جزء من الجائزة. احتفظ بالتقسيم المقترح، أو قسّمها بالتساوي، أو حدّد نصيب كل مركز.',
      placeAmount: 'المركز {place}',
      addsUp: 'المجموع {amount} USDC',
      left: 'يتبقى {amount} USDC للتقسيم',
      over: '{amount} USDC أكثر من الجائزة',
      days: 'المشاركات مفتوحة لمدة',
      daysHint: 'تبقى المشاركات مفتوحة من {min} إلى {max} يومًا.',
      judge: 'تحكم لمدة',
      judgeHint: 'تحكم من {min} إلى {max} يومًا بعد إغلاق المشاركات. إن لم تختر أحدًا، لديك 3 أيام أخرى، ثم تذهب الجائزة إلى أولى المشاركات.',
      dayUnit: 'أيام',
      review: 'راجع المسابقة',
    },
    card: {
      prize: 'الجائزة',
      fee: 'رسوم Karwan',
      total: 'تضع',
      placeGets: ['يحصل المركز الأول على', 'يحصل المركز الثاني على', 'يحصل المركز الثالث على', 'يحصل المركز الرابع على', 'يحصل المركز الخامس على', 'يحصل المركز السادس على', 'يحصل المركز السابع على', 'يحصل المركز الثامن على'],
      title: 'مسابقتك',
      judgingEnds: 'ينتهي التحكيم',
      ifNobody: 'إن لم تختر أحدًا',
      paidOut: 'تُدفع في {date}',
      closes: 'تُغلق المشاركات',
      pickBy: 'اختر الفائزين قبل',
      confirm: 'ضع {amount} USDC',
      short: 'أضف {amount} USDC إلى رصيدك أولًا.',
    },
    page: {
      closes: 'تُغلق المشاركات {date}',
      pickBy: 'اختر الفائزين قبل {date}',
      status: { opening: 'قيد الفتح', open: 'مفتوحة للمشاركة', awarding: 'جارٍ دفع الفائزين', awarded: 'دُفع للفائزين', cancelled: 'سُحبت', returned: 'أُعيدت الجائزة', failed: 'لم تُفتح' },
      brief: 'ما يريده',
      entries: 'المشاركات',
      noEntries: 'لا مشاركات بعد.',
      pick: 'اختر الفائزين',
      pickHint: 'اضغط على مشاركة لكل مركز، الأول أولًا.',
      places: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'],
      pay: 'ادفع للفائزين',
      takeBack: 'اسحبها',
      signIn: 'سجّل الدخول للمشاركة',
      yours: 'مشاركتك',
      yourStatus: {
        entering: 'جارٍ إرسال مشاركتك.',
        in: 'تمت. يرى المشتري المعاينة.',
        won: 'ربحت {amount} USDC.',
        lost: 'لم تُختر هذه المرة.',
        failed: 'لم تُرسل. حاول مجددًا.',
        replaced: 'استُبدلت بمشاركتك الأحدث.',
      },
      enter: 'شارك',
      replace: 'استبدل مشاركتي',
      note: 'ملاحظة للمشتري',
      files: 'عملك',
      filesHint: 'صور أو PDF، حتى 4 ملفات بحجم 5 ميغابايت. يرى المشتري صورتك الأولى قبل الاختيار.',
      closed: 'أُغلقت المشاركات.',
      winner: 'المركز {place}، {amount} USDC',
      file: 'ملف {n}',
    },
    award: { title: 'ادفع للفائزين', body: 'يُدفع لكل فائز الآن وتصلك ملفاته كاملة. لا يمكن التراجع عن ذلك.', back: 'يعود إليك', confirm: 'ادفع للفائزين' },
    cancel: { title: 'اسحب المسابقة', body: 'لم يشارك أحد، لذا تعود الجائزة والرسوم إلى رصيدك.', confirm: 'اسحبها' },
    enterSheet: { title: 'شارك في هذه المسابقة', body: 'يرى المشتري صورتك الأولى وملاحظتك. تصله ملفاتك كاملة فقط إن فزت.', confirm: 'شارك' },
    judging: {
      left: { one: 'بقي يوم واحد', many: 'بقي {n} أيام' },
      phase: { entries: 'المشاركات مفتوحة · {left}', judging: 'التحكيم · {left}', waiting: 'بانتظار المشتري · {left}', paidEarliest: 'دُفعت لأولى المشاركات' },
      dates: { entriesClose: 'تُغلق المشاركات', entriesClosed: 'أُغلقت المشاركات', judgingEnds: 'ينتهي التحكيم', judgingEnded: 'انتهى التحكيم', ifNobody: 'إن لم يُختر أحد', ifYouPickNobody: 'إن لم تختر أحدًا', paidOut: 'تُدفع في {date}', earliestPaid: 'دفع أولى المشاركات' },
      notValid: 'غير صالحة',
      marked: 'مشاركات غير صالحة',
      markedBy: 'علّمها المشتري',
      theirReason: 'سببه',
      newEntry: 'أرسل مشاركة جديدة',
      youWon: 'فزت بالمركز {place}',
      withAgent: '{amount} USDC لدى وكيل البيع الخاص بك.',
      placeRow: 'المركز {place}',
      picked: 'الاختيار',
      earliest: 'أولى المشاركات',
      ifNobodyHint: 'إن لم يُختر أحد عند انتهاء التحكيم، يحصل المشتري على 3 أيام أخرى. ثم تذهب الجائزة إلى أولى المشاركات الصالحة بترتيب إرسالها.',
    },
    mark: { title: 'تعليم مشاركة {name} غير صالحة', why: 'السبب', count: '{n} من 280', confirm: 'علّمها غير صالحة', keep: 'أبقها', hint: 'يمكن لكل مشارك قراءة سببك. لا تُدفع أي مشاركة مُعلَّمة، وإن علّمت كل المشاركات تعود الجائزة إليك.' },
    notNow: 'ليس الآن',
    failed: 'لم يتم ذلك. لم يتحرك شيء.',
  },
  hi: {
    start: { title: 'प्रतियोगिता चलाएँ', body: 'इनाम रखें, विक्रेता अपना काम भेजें, आप आठ तक विजेता चुनें।' },
    market: { title: 'प्रतियोगिताएँ', prize: '{amount} USDC इनाम', winnersOne: '1 विजेता', winnersMany: '{n} विजेता', entries: '{n} प्रविष्टियाँ', closes: 'प्रविष्टियाँ {date} तक' },
    form: {
      title: 'प्रतियोगिता चलाएँ',
      what: 'किसके लिए',
      brief: 'आप क्या चाहते हैं',
      briefHint: 'विक्रेता काम भेजने से पहले इसे पढ़ते हैं।',
      prize: 'इनाम',
      places: 'विजेता',
      kind: 'प्रतियोगिता का प्रकार',
      kinds: { design: 'डिज़ाइन या लेखन', bugs: 'बग खोज', hackathon: 'हैकथॉन' },
      placesOf: '{n} में से',
      fewer: 'एक विजेता कम',
      more: 'एक विजेता और',
      split: 'इनाम कैसे बँटेगा',
      splits: { suggested: 'सुझाया गया', equal: 'बराबर', own: 'मेरा अपना' },
      splitHint: 'हर विजेता को इनाम का एक हिस्सा मिलता है। सुझाया गया बँटवारा रखें, बराबर बाँटें, या हर स्थान का हिस्सा खुद तय करें।',
      placeAmount: '{place} स्थान',
      addsUp: 'कुल {amount} USDC',
      left: 'बाँटने को {amount} USDC बाकी',
      over: 'इनाम से {amount} USDC ज़्यादा',
      days: 'प्रविष्टियाँ खुली रहेंगी',
      daysHint: 'प्रविष्टियाँ {min} से {max} दिन खुली रहती हैं।',
      judge: 'आप जाँचेंगे',
      judgeHint: 'प्रविष्टियाँ बंद होने के बाद आप {min} से {max} दिन जाँचते हैं। अगर आप किसी को नहीं चुनते, तो आपके पास 3 दिन और हैं, फिर इनाम सबसे पहली प्रविष्टियों को जाता है।',
      dayUnit: 'दिन',
      review: 'प्रतियोगिता जाँचें',
    },
    card: {
      prize: 'इनाम',
      fee: 'Karwan शुल्क',
      total: 'आप रखते हैं',
      placeGets: ['पहले स्थान को मिलता है', 'दूसरे स्थान को मिलता है', 'तीसरे स्थान को मिलता है', 'चौथे स्थान को मिलता है', 'पाँचवें स्थान को मिलता है', 'छठे स्थान को मिलता है', 'सातवें स्थान को मिलता है', 'आठवें स्थान को मिलता है'],
      title: 'आपकी प्रतियोगिता',
      judgingEnds: 'जाँच खत्म',
      ifNobody: 'अगर आप किसी को नहीं चुनते',
      paidOut: '{date} को भुगतान',
      closes: 'प्रविष्टियाँ बंद',
      pickBy: 'विजेता चुनें इस तारीख तक',
      confirm: '{amount} USDC रखें',
      short: 'पहले अपने बैलेंस में {amount} USDC जोड़ें।',
    },
    page: {
      closes: 'प्रविष्टियाँ {date} तक',
      pickBy: 'विजेता {date} तक चुनें',
      status: { opening: 'खुल रही है', open: 'प्रविष्टियों के लिए खुली', awarding: 'विजेताओं को भुगतान हो रहा है', awarded: 'विजेताओं को भुगतान हुआ', cancelled: 'वापस ली गई', returned: 'इनाम लौटा', failed: 'नहीं खुली' },
      brief: 'वे क्या चाहते हैं',
      entries: 'प्रविष्टियाँ',
      noEntries: 'अभी कोई प्रविष्टि नहीं।',
      pick: 'विजेता चुनें',
      pickHint: 'हर स्थान के लिए एक प्रविष्टि चुनें, पहले स्थान से शुरू करें।',
      places: ['पहला', 'दूसरा', 'तीसरा', 'चौथा', 'पाँचवाँ', 'छठा', 'सातवाँ', 'आठवाँ'],
      pay: 'विजेताओं को भुगतान करें',
      takeBack: 'वापस लें',
      signIn: 'भाग लेने के लिए साइन इन करें',
      yours: 'आपकी प्रविष्टि',
      yourStatus: {
        entering: 'आपकी प्रविष्टि भेजी जा रही है।',
        in: 'भेजी गई। खरीदार आपका पूर्वावलोकन देखता है।',
        won: 'आपने {amount} USDC जीते।',
        lost: 'इस बार नहीं चुनी गई।',
        failed: 'यह नहीं गई। फिर से कोशिश करें।',
        replaced: 'आपकी नई प्रविष्टि ने इसे बदल दिया।',
      },
      enter: 'भाग लें',
      replace: 'मेरी प्रविष्टि बदलें',
      note: 'खरीदार के लिए नोट',
      files: 'आपका काम',
      filesHint: 'चित्र या PDF, 5 MB की 4 फ़ाइलों तक। चुनने से पहले खरीदार आपकी पहली छवि देखता है।',
      closed: 'प्रविष्टियाँ बंद हो गईं।',
      winner: '{place} स्थान, {amount} USDC',
      file: 'फ़ाइल {n}',
    },
    award: { title: 'विजेताओं को भुगतान करें', body: 'हर विजेता को अभी भुगतान होता है और उसकी पूरी फ़ाइलें आपको मिलती हैं। इसे वापस नहीं किया जा सकता।', back: 'आपको वापस मिलता है', confirm: 'विजेताओं को भुगतान करें' },
    cancel: { title: 'प्रतियोगिता वापस लें', body: 'किसी ने भाग नहीं लिया, इसलिए इनाम और शुल्क आपके बैलेंस में लौटते हैं।', confirm: 'वापस लें' },
    enterSheet: { title: 'इस प्रतियोगिता में भाग लें', body: 'खरीदार आपकी पहली छवि और नोट देखता है। आपकी पूरी फ़ाइलें उसे केवल तभी मिलती हैं जब आप जीतें।', confirm: 'भाग लें' },
    judging: {
      left: { one: '1 दिन बाकी', many: '{n} दिन बाकी' },
      phase: { entries: 'प्रविष्टियाँ खुली · {left}', judging: 'जाँच · {left}', waiting: 'खरीदार का इंतज़ार · {left}', paidEarliest: 'सबसे पहली प्रविष्टियों को भुगतान' },
      dates: { entriesClose: 'प्रविष्टियाँ बंद', entriesClosed: 'प्रविष्टियाँ बंद हुईं', judgingEnds: 'जाँच खत्म', judgingEnded: 'जाँच खत्म हुई', ifNobody: 'अगर कोई नहीं चुना गया', ifYouPickNobody: 'अगर आप किसी को नहीं चुनते', paidOut: '{date} को भुगतान', earliestPaid: 'पहली प्रविष्टियों को भुगतान' },
      notValid: 'मान्य नहीं',
      marked: 'मान्य नहीं चिह्नित',
      markedBy: 'खरीदार ने चिह्नित किया',
      theirReason: 'उनका कारण',
      newEntry: 'नई प्रविष्टि भेजें',
      youWon: 'आपने {place} स्थान जीता',
      withAgent: '{amount} USDC आपके बिक्री एजेंट के पास है।',
      placeRow: '{place} स्थान',
      picked: 'चुनाव',
      earliest: 'सबसे पहली प्रविष्टियाँ',
      ifNobodyHint: 'अगर जाँच खत्म होने तक कोई नहीं चुना जाता, तो खरीदार के पास 3 दिन और हैं। फिर इनाम सबसे पहली मान्य प्रविष्टियों को, भेजने के क्रम में, जाता है।',
    },
    mark: { title: '{name} की प्रविष्टि को मान्य नहीं चिह्नित करें', why: 'क्यों', count: '280 में से {n}', confirm: 'मान्य नहीं चिह्नित करें', keep: 'रहने दें', hint: 'हर प्रतिभागी आपका कारण पढ़ सकता है। चिह्नित प्रविष्टि को कभी भुगतान नहीं होता, और अगर आप सभी को चिह्नित करते हैं तो इनाम आपको लौटता है।' },
    notNow: 'अभी नहीं',
    failed: 'यह पूरा नहीं हुआ। कुछ नहीं बदला।',
  },
  sw: {
    start: { title: 'Endesha shindano', body: 'Weka zawadi, wauzaji watume kazi yao, uchague washindi hadi wanane.' },
    market: { title: 'Mashindano', prize: 'Zawadi ya {amount} USDC', winnersOne: 'Mshindi 1', winnersMany: 'Washindi {n}', entries: 'Maingizo {n}', closes: 'Maingizo yanafungwa {date}' },
    form: {
      title: 'Endesha shindano',
      what: 'Ni kwa ajili ya nini',
      brief: 'Unachotaka',
      briefHint: 'Wauzaji husoma hili kabla ya kutuma kazi yao.',
      prize: 'Zawadi',
      places: 'Washindi',
      kind: 'Aina ya shindano',
      kinds: { design: 'Usanifu au uandishi', bugs: 'Kutafuta hitilafu', hackathon: 'Hackathon' },
      placesOf: 'kati ya {n}',
      fewer: 'Mshindi mmoja pungufu',
      more: 'Mshindi mmoja zaidi',
      split: 'Jinsi zawadi inavyogawanywa',
      splits: { suggested: 'Iliyopendekezwa', equal: 'Sawa', own: 'Yangu' },
      splitHint: 'Kila mshindi anapata sehemu ya zawadi. Baki na mgawanyo uliopendekezwa, gawa sawa, au sema kila nafasi inapata nini.',
      placeAmount: 'Nafasi ya {place}',
      addsUp: 'Jumla {amount} USDC',
      left: '{amount} USDC bado kugawa',
      over: '{amount} USDC zaidi ya zawadi',
      days: 'Maingizo wazi kwa',
      daysHint: 'Maingizo hubaki wazi siku {min} hadi {max}.',
      judge: 'Unahukumu kwa',
      judgeHint: 'Unahukumu siku {min} hadi {max} baada ya maingizo kufungwa. Usipochagua mtu, una siku 3 zaidi, kisha zawadi inakwenda kwa maingizo ya kwanza.',
      dayUnit: 'siku',
      review: 'Kagua shindano',
    },
    card: {
      prize: 'Zawadi',
      fee: 'Ada ya Karwan',
      total: 'Unaweka',
      placeGets: ['Nafasi ya kwanza inapata', 'Nafasi ya pili inapata', 'Nafasi ya tatu inapata', 'Nafasi ya nne inapata', 'Nafasi ya tano inapata', 'Nafasi ya sita inapata', 'Nafasi ya saba inapata', 'Nafasi ya nane inapata'],
      title: 'Shindano lako',
      judgingEnds: 'Hukumu inaisha',
      ifNobody: 'Usipochagua mtu',
      paidOut: 'Inalipwa {date}',
      closes: 'Maingizo yanafungwa',
      pickBy: 'Chagua washindi kabla ya',
      confirm: 'Weka {amount} USDC',
      short: 'Ongeza {amount} USDC kwenye salio lako kwanza.',
    },
    page: {
      closes: 'Maingizo yanafungwa {date}',
      pickBy: 'Chagua washindi kabla ya {date}',
      status: { opening: 'Linafunguliwa', open: 'Wazi kwa maingizo', awarding: 'Washindi wanalipwa', awarded: 'Washindi wamelipwa', cancelled: 'Limerudishwa', returned: 'Zawadi imerudishwa', failed: 'Halikufunguliwa' },
      brief: 'Wanachotaka',
      entries: 'Maingizo',
      noEntries: 'Hakuna maingizo bado.',
      pick: 'Chagua washindi',
      pickHint: 'Gusa ingizo kwa kila nafasi, kuanzia ya kwanza.',
      places: ['Kwanza', 'Pili', 'Tatu', 'Nne', 'Tano', 'Sita', 'Saba', 'Nane'],
      pay: 'Lipa washindi',
      takeBack: 'Lirudishe',
      signIn: 'Ingia ili ushiriki',
      yours: 'Ingizo lako',
      yourStatus: {
        entering: 'Ingizo lako linatumwa.',
        in: 'Limeingia. Mnunuzi anaona hakikisho lako.',
        won: 'Umeshinda {amount} USDC.',
        lost: 'Halikuchaguliwa wakati huu.',
        failed: 'Halikuingia. Jaribu tena.',
        replaced: 'Limebadilishwa na ingizo lako jipya.',
      },
      enter: 'Shiriki',
      replace: 'Badilisha ingizo langu',
      note: 'Ujumbe kwa mnunuzi',
      files: 'Kazi yako',
      filesHint: 'Picha au PDF, hadi faili 4 za MB 5. Mnunuzi anaona picha yako ya kwanza kabla ya kuchagua.',
      closed: 'Maingizo yamefungwa.',
      winner: 'Nafasi ya {place}, {amount} USDC',
      file: 'Faili {n}',
    },
    award: { title: 'Lipa washindi', body: 'Kila mshindi analipwa sasa na faili zake kamili zinakufikia. Hili haliwezi kurudishwa.', back: 'Inarudi kwako', confirm: 'Lipa washindi' },
    cancel: { title: 'Rudisha shindano', body: 'Hakuna aliyeshiriki, kwa hiyo zawadi na ada vinarudi kwenye salio lako.', confirm: 'Lirudishe' },
    enterSheet: { title: 'Shiriki shindano hili', body: 'Mnunuzi anaona picha yako ya kwanza na ujumbe wako. Faili zako kamili zinamfikia tu ukishinda.', confirm: 'Shiriki' },
    judging: {
      left: { one: 'Siku 1 imebaki', many: 'Siku {n} zimebaki' },
      phase: { entries: 'Maingizo wazi · {left}', judging: 'Hukumu · {left}', waiting: 'Tunamsubiri mnunuzi · {left}', paidEarliest: 'Imelipwa kwa maingizo ya kwanza' },
      dates: { entriesClose: 'Maingizo yanafungwa', entriesClosed: 'Maingizo yamefungwa', judgingEnds: 'Hukumu inaisha', judgingEnded: 'Hukumu imeisha', ifNobody: 'Asipochaguliwa mtu', ifYouPickNobody: 'Usipochagua mtu', paidOut: 'Inalipwa {date}', earliestPaid: 'Maingizo ya kwanza yanalipwa' },
      notValid: 'Si halali',
      marked: 'Yaliyowekwa si halali',
      markedBy: 'Imewekwa na mnunuzi',
      theirReason: 'Sababu yake',
      newEntry: 'Tuma ingizo jipya',
      youWon: 'Umeshinda nafasi ya {place}',
      withAgent: '{amount} USDC ziko kwa wakala wako wa mauzo.',
      placeRow: 'Nafasi ya {place}',
      picked: 'Waliochaguliwa',
      earliest: 'Maingizo ya kwanza',
      ifNobodyHint: 'Asipochaguliwa mtu hukumu ikiisha, mnunuzi ana siku 3 zaidi. Kisha zawadi inakwenda kwa maingizo halali ya kwanza, kwa mpangilio yalivyotumwa.',
    },
    mark: { title: 'Weka ingizo la {name} si halali', why: 'Kwa nini', count: '{n} kati ya 280', confirm: 'Weka si halali', keep: 'Liache', hint: 'Kila mshiriki anaweza kusoma sababu yako. Ingizo lililowekwa halilipwi kamwe, na ukiweka yote, zawadi inarudi kwako.' },
    notNow: 'Si sasa',
    failed: 'Haikufanikiwa. Hakuna kilichohamishwa.',
  },
};
