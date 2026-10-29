/// Contests (view 40): a prize held from the start, entries from sellers, the
/// buyer picks up to three winners. Never "bounty", "escrow" or "evaluator".
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
    placesOptions: [string, string, string];
    days: string;
    daysHint: string;
    review: string;
  };
  card: { title: string; prize: string; fee: string; total: string; placeGets: [string, string, string]; closes: string; pickBy: string; confirm: string; short: string };
  page: {
    closes: string;
    pickBy: string;
    status: { opening: string; open: string; awarding: string; awarded: string; cancelled: string; returned: string; failed: string };
    brief: string;
    entries: string;
    noEntries: string;
    pick: string;
    pickHint: string;
    places: [string, string, string];
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
  notNow: string;
  failed: string;
}

export const contestsCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', ContestsCopy> = {
  en: {
    start: { title: 'Run a contest', body: 'Put up a prize, sellers send their work, you pick up to three winners.' },
    market: { title: 'Contests', prize: '{amount} USDC prize', winnersOne: '1 winner', winnersMany: '{n} winners', entries: '{n} entries', closes: 'Entries close {date}' },
    form: {
      title: 'Run a contest',
      what: 'What it is for',
      brief: 'What you want',
      briefHint: 'Sellers read this before they send their work.',
      prize: 'Prize in USDC',
      places: 'Winners',
      placesOptions: ['1 winner', '2 winners', '3 winners'],
      days: 'Days to enter',
      daysHint: 'Entries stay open 1 to 30 days. You then have 7 days to pick the winners.',
      review: 'Review',
    },
    card: {
      title: 'Put up the prize',
      prize: 'Prize',
      fee: 'Karwan fee',
      total: 'You put up',
      placeGets: ['First place gets', 'Second place gets', 'Third place gets'],
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
      places: ['First', 'Second', 'Third'],
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
    notNow: 'Not now',
    failed: 'That did not go through. Nothing moved.',
  },
  fr: {
    start: { title: 'Lancer un concours', body: 'Mettez un prix en jeu, les vendeurs envoient leur travail, vous choisissez jusqu’à trois gagnants.' },
    market: { title: 'Concours', prize: 'Prix de {amount} USDC', winnersOne: '1 gagnant', winnersMany: '{n} gagnants', entries: '{n} participations', closes: 'Participations jusqu’au {date}' },
    form: {
      title: 'Lancer un concours',
      what: 'Pour quoi',
      brief: 'Ce que vous voulez',
      briefHint: 'Les vendeurs le lisent avant d’envoyer leur travail.',
      prize: 'Prix en USDC',
      places: 'Gagnants',
      placesOptions: ['1 gagnant', '2 gagnants', '3 gagnants'],
      days: 'Jours pour participer',
      daysHint: 'Les participations restent ouvertes de 1 à 30 jours. Vous avez ensuite 7 jours pour choisir les gagnants.',
      review: 'Vérifier',
    },
    card: {
      title: 'Mettre le prix en jeu',
      prize: 'Prix',
      fee: 'Frais Karwan',
      total: 'Vous mettez',
      placeGets: ['La première place reçoit', 'La deuxième place reçoit', 'La troisième place reçoit'],
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
      places: ['Première', 'Deuxième', 'Troisième'],
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
    notNow: 'Pas maintenant',
    failed: 'Cela n’est pas passé. Rien n’a bougé.',
  },
  ar: {
    start: { title: 'أطلق مسابقة', body: 'ضع جائزة، يرسل البائعون أعمالهم، وتختار حتى ثلاثة فائزين.' },
    market: { title: 'المسابقات', prize: 'جائزة {amount} USDC', winnersOne: 'فائز واحد', winnersMany: '{n} فائزين', entries: '{n} مشاركات', closes: 'تُغلق المشاركات {date}' },
    form: {
      title: 'أطلق مسابقة',
      what: 'لأي شيء',
      brief: 'ما تريده',
      briefHint: 'يقرأ البائعون هذا قبل إرسال أعمالهم.',
      prize: 'الجائزة بـ USDC',
      places: 'الفائزون',
      placesOptions: ['فائز واحد', 'فائزان', '3 فائزين'],
      days: 'أيام المشاركة',
      daysHint: 'تبقى المشاركات مفتوحة من يوم إلى 30 يومًا. ثم لديك 7 أيام لاختيار الفائزين.',
      review: 'مراجعة',
    },
    card: {
      title: 'ضع الجائزة',
      prize: 'الجائزة',
      fee: 'رسوم Karwan',
      total: 'تضع',
      placeGets: ['يحصل المركز الأول على', 'يحصل المركز الثاني على', 'يحصل المركز الثالث على'],
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
      places: ['الأول', 'الثاني', 'الثالث'],
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
    notNow: 'ليس الآن',
    failed: 'لم يتم ذلك. لم يتحرك شيء.',
  },
  hi: {
    start: { title: 'प्रतियोगिता चलाएँ', body: 'इनाम रखें, विक्रेता अपना काम भेजें, आप तीन तक विजेता चुनें।' },
    market: { title: 'प्रतियोगिताएँ', prize: '{amount} USDC इनाम', winnersOne: '1 विजेता', winnersMany: '{n} विजेता', entries: '{n} प्रविष्टियाँ', closes: 'प्रविष्टियाँ {date} तक' },
    form: {
      title: 'प्रतियोगिता चलाएँ',
      what: 'किसके लिए',
      brief: 'आप क्या चाहते हैं',
      briefHint: 'विक्रेता काम भेजने से पहले इसे पढ़ते हैं।',
      prize: 'USDC में इनाम',
      places: 'विजेता',
      placesOptions: ['1 विजेता', '2 विजेता', '3 विजेता'],
      days: 'प्रविष्टि के दिन',
      daysHint: 'प्रविष्टियाँ 1 से 30 दिन खुली रहती हैं। फिर विजेता चुनने के लिए आपके पास 7 दिन हैं।',
      review: 'जाँचें',
    },
    card: {
      title: 'इनाम रखें',
      prize: 'इनाम',
      fee: 'Karwan शुल्क',
      total: 'आप रखते हैं',
      placeGets: ['पहले स्थान को मिलता है', 'दूसरे स्थान को मिलता है', 'तीसरे स्थान को मिलता है'],
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
      places: ['पहला', 'दूसरा', 'तीसरा'],
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
    notNow: 'अभी नहीं',
    failed: 'यह पूरा नहीं हुआ। कुछ नहीं बदला।',
  },
  sw: {
    start: { title: 'Endesha shindano', body: 'Weka zawadi, wauzaji watume kazi yao, uchague washindi hadi watatu.' },
    market: { title: 'Mashindano', prize: 'Zawadi ya {amount} USDC', winnersOne: 'Mshindi 1', winnersMany: 'Washindi {n}', entries: 'Maingizo {n}', closes: 'Maingizo yanafungwa {date}' },
    form: {
      title: 'Endesha shindano',
      what: 'Ni kwa ajili ya nini',
      brief: 'Unachotaka',
      briefHint: 'Wauzaji husoma hili kabla ya kutuma kazi yao.',
      prize: 'Zawadi kwa USDC',
      places: 'Washindi',
      placesOptions: ['Mshindi 1', 'Washindi 2', 'Washindi 3'],
      days: 'Siku za kuingia',
      daysHint: 'Maingizo hubaki wazi siku 1 hadi 30. Kisha una siku 7 kuchagua washindi.',
      review: 'Kagua',
    },
    card: {
      title: 'Weka zawadi',
      prize: 'Zawadi',
      fee: 'Ada ya Karwan',
      total: 'Unaweka',
      placeGets: ['Nafasi ya kwanza inapata', 'Nafasi ya pili inapata', 'Nafasi ya tatu inapata'],
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
      places: ['Kwanza', 'Pili', 'Tatu'],
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
    notNow: 'Si sasa',
    failed: 'Haikufanikiwa. Hakuna kilichohamishwa.',
  },
};
