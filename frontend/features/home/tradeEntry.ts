import type { Locale } from '@/shared/i18n/locales';

/// One way to start a trade for every account (view 17). A business sees the
/// business wording inside the same forms.
export const tradeEntryRoutes = () => ({
  buy: '/buyer?mode=managed#new-deal',
  sell: '/seller#post-listing',
  agreement: '/buyer?mode=direct#new-deal',
});

type Copy = { startHere: string; find: string;
  entry: { question: string; note: string; self: string; business: string; settingsLabel: string; saveError: string };
  title: string; body: string; sell: string; sellBody: string; buy: string; buyBody: string;
  agreement: string; options: string; buyTitle: string; sellTitle: string; businessBuyBody: string;
  link: { question: string; paying: string; payingBody: string; gettingPaid: string; gettingPaidBody: string; title: string; note: string; copy: string; copied: string; share: string; requestInstead: string; noTag: string };
  block: { getPaid: string; getPaidBody: string; sendLink: string; request: string; findWork: string; findWorkBody: string; seeRequests: string; postNeed: string; postNeedBody: string; postRequest: string; setUp: string; setUpBody: string; start: string };
  journey: { brief: string; match: string; agree: string; settle: string };
  desk: {
    eyebrow: string; title: string; body: string; choosePath: string; paths: string; tryAgain: string;
    question: string; allActivity: string; loading: string;
    need: string; needBody: string;
    sell: string; sellBody: string; bringAgreement: string; bringAgreementBody: string;
    active: string; emptyTitle: string; emptyBody: string; open: string;
    hub: {
      yours: string; trades: string; yourMove: string; noMove: string;
      requests: string; noneOpen: string; offersIn: string; offersInOne: string; noOffers: string;
      offers: string; live: string; noneLive: string; postRequest: string; postOffer: string;
    };
  } };

export const TRADE_ENTRY_COPY: Record<Locale, Copy> = {
  en: {
    entry: { question: 'Do you trade for yourself or for a business?', note: 'This changes the details you see. You can change it in Settings.', self: 'For myself', business: 'For a business', settingsLabel: 'I trade for a business', saveError: 'Your answer was not saved. Try again.' },
    find: 'Find',
    startHere: 'Start here',
    options: 'Optional request settings',
    title: 'Start a trade',
    body: 'Tell Karwan what you need or offer. Review the match and agree the deal before payment.',
    sell: 'Find customers', sellBody: 'List your product or service so buyers on Karwan can find you.',
    buy: 'Find something to buy', buyBody: 'Describe what you need, your budget and your deadline.',
    businessBuyBody: 'Browse what businesses offer on Karwan, then agree a deal.',
    agreement: 'I already have an agreement',
    link: { question: 'Are you paying, or getting paid?', paying: 'I am paying', payingBody: 'Fill in the deal you agreed, then pay into it.', gettingPaid: 'I am getting paid', gettingPaidBody: 'Send the other person your deal link.', title: 'Your deal link', note: 'They open it, add the amount and terms you agreed, and pay into the deal. You accept before anything is final.', copy: 'Copy link', copied: 'Copied', share: 'Share', requestInstead: 'Request a payment instead', noTag: 'Choose your Karwan tag in Profile to get your deal link.' },
    block: { getPaid: 'Get paid by a client', getPaidBody: 'Send them your deal link, or ask for a payment.', sendLink: 'Send a deal link', request: 'Request a payment', findWork: 'Find work', findWorkBody: 'Requests on the market that fit what you do.', seeRequests: 'See requests', postNeed: 'What do you need?', postNeedBody: 'Post it and sellers send you offers.', postRequest: 'Post a request', setUp: 'Set up Karwan in a minute', setUpBody: 'A few questions, and Karwan works the way you do.', start: 'Start' },
    buyTitle: 'What do you need?', sellTitle: 'What do you offer?',
    journey: { brief: 'Brief', match: 'Match', agree: 'Agree', settle: 'Settle' },
    desk: {
      eyebrow: 'Trade desk', title: 'What would you like to trade?',
      body: 'Find the right counterparty, bring your terms, and keep each deal moving.',
      choosePath: 'Choose a path', paths: '2 paths', tryAgain: 'Try again',
      question: 'What are you moving today?', allActivity: 'All activity', loading: 'Loading active agreements',
      need: 'I need something', needBody: 'Post what you need. Sellers send you offers.',
      sell: 'I sell something', sellBody: 'List what you offer. Buyers on Karwan find you.',
      bringAgreement: 'I already agreed with someone', bringAgreementBody: 'Start with someone you already know.',
      active: 'Active agreements', emptyTitle: 'Nothing active yet',
      emptyBody: 'Choose a path above and your agreement will stay here.', open: 'Open agreement',
      hub: { yours: 'Your trades', trades: 'Active trades', yourMove: '{n} waiting on you', noMove: 'Nothing waiting on you', requests: 'Your requests', noneOpen: 'Nothing open', offersIn: '{n} offers in', offersInOne: '1 offer in', noOffers: 'No offers yet', offers: 'Your offers', live: 'Live on the market', noneLive: 'Nothing live', postRequest: 'Post a request', postOffer: 'Post an offer' },
    },
  },
  fr: {
    entry: { question: 'Vous échangez pour vous-même ou pour une entreprise ?', note: 'Cela change les détails affichés. Vous pouvez le modifier dans les paramètres.', self: 'Pour moi', business: 'Pour une entreprise', settingsLabel: 'J’échange pour une entreprise', saveError: 'Votre réponse n’a pas été enregistrée. Réessayez.' },
    find: 'Trouver',
    startHere: 'Commencez ici',
    options: 'Réglages facultatifs de la demande',
    title: 'Commencer un échange',
    body: 'Dites à Karwan ce que vous cherchez ou proposez. Examinez la mise en relation et convenez des conditions avant de payer.',
    sell: 'Trouver des clients', sellBody: 'Publiez votre produit ou service pour que les acheteurs sur Karwan vous trouvent.',
    buy: 'Trouver quoi acheter', buyBody: 'Décrivez votre besoin, votre budget et votre échéance.',
    businessBuyBody: 'Parcourez les offres des entreprises sur Karwan, puis convenez d’un accord.',
    agreement: 'J’ai déjà un accord',
    link: { question: 'Vous payez, ou vous êtes payé ?', paying: 'Je paie', payingBody: 'Remplissez l’accord convenu, puis payez dedans.', gettingPaid: 'Je suis payé', gettingPaidBody: 'Envoyez votre lien d’accord à l’autre personne.', title: 'Votre lien d’accord', note: 'Elle l’ouvre, ajoute le montant et les conditions convenus, et paie dans l’accord. Vous acceptez avant que rien ne soit définitif.', copy: 'Copier le lien', copied: 'Copié', share: 'Partager', requestInstead: 'Demander un paiement à la place', noTag: 'Choisissez votre identifiant Karwan dans Profil pour obtenir votre lien.' },
    block: { getPaid: 'Être payé par un client', getPaidBody: 'Envoyez votre lien d’accord, ou demandez un paiement.', sendLink: 'Envoyer un lien d’accord', request: 'Demander un paiement', findWork: 'Trouver du travail', findWorkBody: 'Les demandes du marché qui correspondent à ce que vous faites.', seeRequests: 'Voir les demandes', postNeed: 'De quoi avez-vous besoin ?', postNeedBody: 'Publiez-le et les vendeurs vous font des offres.', postRequest: 'Publier une demande', setUp: 'Configurez Karwan en une minute', setUpBody: 'Quelques questions, et Karwan s’adapte à vous.', start: 'Commencer' },
    buyTitle: 'De quoi avez-vous besoin ?', sellTitle: 'Que proposez-vous ?',
    journey: { brief: 'Besoin', match: 'Mise en relation', agree: 'Accord', settle: 'Règlement' },
    desk: {
      eyebrow: 'Bureau des échanges', title: 'Que souhaitez-vous échanger ?',
      body: 'Trouvez le bon partenaire, apportez vos conditions et faites avancer chaque accord.',
      choosePath: 'Choisir une voie', paths: '2 voies', tryAgain: 'Réessayer',
      question: 'Que faites-vous avancer aujourd’hui ?', allActivity: 'Toute l’activité', loading: 'Chargement des accords actifs',
      need: 'J’ai besoin de quelque chose', needBody: 'Publiez votre besoin. Les vendeurs vous font des offres.',
      sell: 'Je vends quelque chose', sellBody: 'Publiez ce que vous proposez. Les acheteurs sur Karwan vous trouvent.',
      bringAgreement: 'J’ai déjà un accord avec quelqu’un', bringAgreementBody: 'Commencez avec une personne que vous connaissez déjà.',
      active: 'Accords actifs', emptyTitle: 'Aucun accord actif',
      emptyBody: 'Choisissez une voie ci-dessus et votre accord restera ici.', open: 'Ouvrir l’accord',
      hub: { yours: 'Vos échanges', trades: 'Échanges en cours', yourMove: '{n} attendent votre action', noMove: 'Rien n’attend votre action', requests: 'Vos demandes', noneOpen: 'Rien en cours', offersIn: '{n} offres reçues', offersInOne: '1 offre reçue', noOffers: 'Aucune offre pour l’instant', offers: 'Vos offres', live: 'En ligne sur le marché', noneLive: 'Rien en ligne', postRequest: 'Publier une demande', postOffer: 'Publier une offre' },
    },
  },
  ar: {
    entry: { question: 'هل تتاجر لنفسك أم لشركة؟', note: 'يغيّر هذا التفاصيل التي تراها. يمكنك تغييره من الإعدادات.', self: 'لنفسي', business: 'لشركة', settingsLabel: 'أتاجر لصالح شركة', saveError: 'لم تُحفظ إجابتك. حاول مرة أخرى.' },
    find: 'ابحث',
    startHere: 'ابدأ هنا',
    options: 'إعدادات الطلب الاختيارية',
    title: 'ابدأ صفقة',
    body: 'أخبر Karwan بما تحتاجه أو تقدمه. راجع الطرف المقترح واتفق على الصفقة قبل الدفع.',
    sell: 'ابحث عن عملاء', sellBody: 'اعرض منتجك أو خدمتك ليجدك المشترون على Karwan.',
    buy: 'ابحث عما تشتريه', buyBody: 'صف ما تحتاجه وحدد ميزانيتك وموعد التسليم.',
    businessBuyBody: 'تصفح عروض الشركات على Karwan، ثم اتفق على صفقة.',
    agreement: 'لدي اتفاق بالفعل',
    link: { question: 'هل أنت من يدفع، أم من يُدفع له؟', paying: 'أنا أدفع', payingBody: 'املأ الصفقة المتفق عليها، ثم ادفع فيها.', gettingPaid: 'يُدفع لي', gettingPaidBody: 'أرسل رابط صفقتك إلى الطرف الآخر.', title: 'رابط صفقتك', note: 'يفتحه، ويضيف المبلغ والشروط المتفق عليها، ويدفع في الصفقة. توافق أنت قبل أن يصبح أي شيء نهائيًا.', copy: 'انسخ الرابط', copied: 'تم النسخ', share: 'شارك', requestInstead: 'اطلب دفعة بدلًا من ذلك', noTag: 'اختر وسم Karwan الخاص بك من الملف الشخصي لتحصل على رابطك.' },
    block: { getPaid: 'احصل على أجرك من عميل', getPaidBody: 'أرسل رابط صفقتك، أو اطلب دفعة.', sendLink: 'أرسل رابط صفقة', request: 'اطلب دفعة', findWork: 'ابحث عن عمل', findWorkBody: 'طلبات في السوق تناسب ما تقدمه.', seeRequests: 'اعرض الطلبات', postNeed: 'ماذا تحتاج؟', postNeedBody: 'انشره وسيرسل لك البائعون عروضهم.', postRequest: 'انشر طلبًا', setUp: 'جهّز Karwan في دقيقة', setUpBody: 'بضعة أسئلة، ويعمل Karwan بطريقتك.', start: 'ابدأ' },
    buyTitle: 'ماذا تحتاج؟', sellTitle: 'ماذا تقدم؟',
    journey: { brief: 'الطلب', match: 'المطابقة', agree: 'الاتفاق', settle: 'التسوية' },
    desk: {
      eyebrow: 'مكتب التداول', title: 'ماذا تريد أن تتداول؟',
      body: 'اعثر على الطرف المناسب، أضف شروطك، وحافظ على تقدم كل صفقة.',
      choosePath: 'اختر مساراً', paths: 'مساران', tryAgain: 'حاول مرة أخرى',
      question: 'ما الذي تحركه اليوم؟', allActivity: 'كل النشاطات', loading: 'جارٍ تحميل الاتفاقات النشطة',
      need: 'أحتاج شيئًا', needBody: 'انشر ما تحتاجه ليرسل لك البائعون عروضهم.',
      sell: 'أبيع شيئًا', sellBody: 'اعرض ما تقدمه ليجدك المشترون على Karwan.',
      bringAgreement: 'اتفقت مع شخص بالفعل', bringAgreementBody: 'ابدأ مع شخص تعرفه بالفعل.',
      active: 'الاتفاقات النشطة', emptyTitle: 'لا توجد اتفاقات نشطة',
      emptyBody: 'اختر مساراً أعلاه وسيبقى اتفاقك هنا.', open: 'افتح الاتفاق',
      hub: { yours: 'تداولاتك', trades: 'صفقات نشطة', yourMove: '{n} بانتظارك', noMove: 'لا شيء بانتظارك', requests: 'طلباتك', noneOpen: 'لا شيء مفتوح', offersIn: 'وصلت {n} عروض', offersInOne: 'وصل عرض واحد', noOffers: 'لا عروض بعد', offers: 'عروضك', live: 'معروضة في السوق', noneLive: 'لا شيء معروض', postRequest: 'انشر طلبًا', postOffer: 'انشر عرضًا' },
    },
  },
  hi: {
    entry: { question: 'आप अपने लिए व्यापार करते हैं या किसी व्यवसाय के लिए?', note: 'इससे आपको दिखने वाली जानकारी बदलती है। आप इसे सेटिंग्स में बदल सकते हैं।', self: 'अपने लिए', business: 'व्यवसाय के लिए', settingsLabel: 'मेरा व्यापार एक व्यवसाय के लिए है', saveError: 'आपका जवाब सेव नहीं हुआ। फिर से कोशिश करें।' },
    find: 'खोजें',
    startHere: 'यहाँ से शुरू करें',
    options: 'अनुरोध की वैकल्पिक सेटिंग',
    title: 'व्यापार शुरू करें',
    body: 'Karwan को बताएं कि आपको क्या चाहिए या आप क्या देते हैं। भुगतान से पहले मिलान देखें और सौदे की शर्तें तय करें।',
    sell: 'ग्राहक खोजें', sellBody: 'अपना उत्पाद या सेवा सूचीबद्ध करें ताकि Karwan के खरीदार आपको खोज सकें।',
    buy: 'खरीदने के लिए खोजें', buyBody: 'अपनी ज़रूरत, बजट और समय सीमा बताएं।',
    businessBuyBody: 'Karwan पर व्यवसायों की पेशकश देखें, फिर सौदे की शर्तें तय करें।',
    agreement: 'मेरा समझौता पहले से है',
    link: { question: 'आप भुगतान कर रहे हैं, या आपको भुगतान मिल रहा है?', paying: 'मैं भुगतान कर रहा हूँ', payingBody: 'तय किया गया सौदा भरें, फिर उसमें भुगतान करें।', gettingPaid: 'मुझे भुगतान मिल रहा है', gettingPaidBody: 'दूसरे व्यक्ति को अपना सौदा लिंक भेजें।', title: 'आपका सौदा लिंक', note: 'वे इसे खोलते हैं, तय रकम और शर्तें जोड़ते हैं, और सौदे में भुगतान करते हैं। कुछ भी अंतिम होने से पहले आप स्वीकार करते हैं।', copy: 'लिंक कॉपी करें', copied: 'कॉपी हो गया', share: 'शेयर करें', requestInstead: 'इसके बजाय भुगतान का अनुरोध करें', noTag: 'अपना सौदा लिंक पाने के लिए प्रोफ़ाइल में अपना Karwan टैग चुनें।' },
    block: { getPaid: 'ग्राहक से भुगतान पाएँ', getPaidBody: 'उन्हें अपना सौदा लिंक भेजें, या भुगतान माँगें।', sendLink: 'सौदा लिंक भेजें', request: 'भुगतान का अनुरोध करें', findWork: 'काम खोजें', findWorkBody: 'बाज़ार के अनुरोध जो आपके काम से मेल खाते हैं।', seeRequests: 'अनुरोध देखें', postNeed: 'आपको क्या चाहिए?', postNeedBody: 'पोस्ट करें और विक्रेता आपको ऑफ़र भेजेंगे।', postRequest: 'अनुरोध पोस्ट करें', setUp: 'एक मिनट में Karwan सेट करें', setUpBody: 'कुछ सवाल, और Karwan आपके तरीके से काम करता है।', start: 'शुरू करें' },
    buyTitle: 'आपको क्या चाहिए?', sellTitle: 'आप क्या देते हैं?',
    journey: { brief: 'ज़रूरत', match: 'मिलान', agree: 'सहमति', settle: 'निपटान' },
    desk: {
      eyebrow: 'व्यापार डेस्क', title: 'आप क्या व्यापार करना चाहेंगे?',
      body: 'सही साथी खोजें, अपनी शर्तें लाएं और हर सौदे को आगे बढ़ाते रहें।',
      choosePath: 'एक रास्ता चुनें', paths: '2 रास्ते', tryAgain: 'फिर कोशिश करें',
      question: 'आज आप क्या आगे बढ़ा रहे हैं?', allActivity: 'सारी गतिविधि', loading: 'सक्रिय समझौते लोड हो रहे हैं',
      need: 'मुझे कुछ चाहिए', needBody: 'अपनी ज़रूरत पोस्ट करें। विक्रेता आपको ऑफ़र भेजेंगे।',
      sell: 'मैं कुछ बेचता हूँ', sellBody: 'जो आप देते हैं उसे सूचीबद्ध करें। Karwan पर खरीदार आपको ढूँढेंगे।',
      bringAgreement: 'मेरा किसी से पहले से समझौता है', bringAgreementBody: 'किसी ऐसे व्यक्ति से शुरू करें जिसे आप पहले से जानते हैं।',
      active: 'सक्रिय समझौते', emptyTitle: 'अभी कुछ सक्रिय नहीं',
      emptyBody: 'ऊपर से कोई रास्ता चुनें और आपका समझौता यहाँ रहेगा।', open: 'समझौता खोलें',
      hub: { yours: 'आपका व्यापार', trades: 'सक्रिय सौदे', yourMove: '{n} आपकी प्रतीक्षा में', noMove: 'कुछ भी आपकी प्रतीक्षा में नहीं', requests: 'आपके अनुरोध', noneOpen: 'कुछ भी खुला नहीं', offersIn: '{n} ऑफ़र मिले', offersInOne: '1 ऑफ़र मिला', noOffers: 'अभी कोई ऑफ़र नहीं', offers: 'आपके ऑफ़र', live: 'बाज़ार में उपलब्ध', noneLive: 'कुछ भी उपलब्ध नहीं', postRequest: 'अनुरोध पोस्ट करें', postOffer: 'ऑफ़र पोस्ट करें' },
    },
  },
  sw: {
    entry: { question: 'Unafanya biashara kwa ajili yako au kwa ajili ya kampuni?', note: 'Hii hubadilisha maelezo unayoona. Unaweza kuibadilisha kwenye Mipangilio.', self: 'Kwa ajili yangu', business: 'Kwa ajili ya kampuni', settingsLabel: 'Ninafanya biashara kwa ajili ya kampuni', saveError: 'Jibu lako halijahifadhiwa. Jaribu tena.' },
    find: 'Tafuta',
    startHere: 'Anza hapa',
    options: 'Mipangilio ya hiari ya ombi',
    title: 'Anza biashara',
    body: 'Iambie Karwan unachohitaji au unachotoa. Kagua mlingano na ukubaliane kuhusu biashara kabla ya malipo.',
    sell: 'Tafuta wateja', sellBody: 'Orodhesha bidhaa au huduma yako ili wanunuzi wa Karwan wakupate.',
    buy: 'Tafuta cha kununua', buyBody: 'Eleza unachohitaji, bajeti yako na tarehe ya mwisho.',
    businessBuyBody: 'Angalia bidhaa na huduma za biashara kwenye Karwan, kisha ukubaliane kuhusu biashara.',
    agreement: 'Tayari nina makubaliano',
    link: { question: 'Unalipa, au unalipwa?', paying: 'Ninalipa', payingBody: 'Jaza makubaliano mliyokubaliana, kisha ulipe ndani yake.', gettingPaid: 'Ninalipwa', gettingPaidBody: 'Mtumie mtu mwingine kiungo cha makubaliano yako.', title: 'Kiungo cha makubaliano yako', note: 'Anakifungua, anaongeza kiasi na masharti mliyokubaliana, na analipa ndani ya makubaliano. Wewe unakubali kabla chochote hakijawa cha mwisho.', copy: 'Nakili kiungo', copied: 'Imenakiliwa', share: 'Shiriki', requestInstead: 'Omba malipo badala yake', noTag: 'Chagua lebo yako ya Karwan kwenye Wasifu ili upate kiungo chako.' },
    block: { getPaid: 'Lipwa na mteja', getPaidBody: 'Mtumie kiungo cha makubaliano yako, au omba malipo.', sendLink: 'Tuma kiungo cha makubaliano', request: 'Omba malipo', findWork: 'Tafuta kazi', findWorkBody: 'Maombi sokoni yanayolingana na unachofanya.', seeRequests: 'Angalia maombi', postNeed: 'Unahitaji nini?', postNeedBody: 'Ichapishe na wauzaji watakutumia ofa.', postRequest: 'Chapisha ombi', setUp: 'Weka Karwan kwa dakika moja', setUpBody: 'Maswali machache, na Karwan inafanya kazi kwa njia yako.', start: 'Anza' },
    buyTitle: 'Unahitaji nini?', sellTitle: 'Unatoa nini?',
    journey: { brief: 'Hitaji', match: 'Ulinganifu', agree: 'Kubali', settle: 'Malipo' },
    desk: {
      eyebrow: 'Dawati la biashara', title: 'Ungependa kufanya biashara gani?',
      body: 'Pata mshirika anayefaa, leta masharti yako na endeleza kila biashara.',
      choosePath: 'Chagua njia', paths: 'Njia 2', tryAgain: 'Jaribu tena',
      question: 'Unasogeza nini leo?', allActivity: 'Shughuli zote', loading: 'Inapakia makubaliano yanayoendelea',
      need: 'Nahitaji kitu', needBody: 'Chapisha unachohitaji. Wauzaji watakutumia ofa.',
      sell: 'Nauza kitu', sellBody: 'Orodhesha unachotoa. Wanunuzi kwenye Karwan watakupata.',
      bringAgreement: 'Tayari nimekubaliana na mtu', bringAgreementBody: 'Anza na mtu unayemjua tayari.',
      active: 'Makubaliano yanayoendelea', emptyTitle: 'Hakuna yanayoendelea bado',
      emptyBody: 'Chagua njia hapo juu na makubaliano yako yatabaki hapa.', open: 'Fungua makubaliano',
      hub: { yours: 'Biashara yako', trades: 'Biashara zinazoendelea', yourMove: '{n} zinakusubiri', noMove: 'Hakuna kinachokusubiri', requests: 'Maombi yako', noneOpen: 'Hakuna lililo wazi', offersIn: 'Ofa {n} zimefika', offersInOne: 'Ofa 1 imefika', noOffers: 'Bado hakuna ofa', offers: 'Ofa zako', live: 'Ziko sokoni', noneLive: 'Hakuna iliyo sokoni', postRequest: 'Chapisha ombi', postOffer: 'Chapisha ofa' },
    },
  },
};
