import type { Locale } from '@/shared/i18n/locales';

export const tradeEntryRoutes = (business: boolean) => ({
  sell: business ? '/supply' : '/seller#post-listing',
  buy: business ? '/partners' : '/buyer?mode=managed#new-deal',
  agreement: business ? '/buyer?mode=direct#bring-a-deal' : '/buyer?mode=direct#new-deal',
});

type Copy = { startHere: string; title: string; body: string; sell: string; sellBody: string; buy: string; buyBody: string;
  agreement: string; options: string; buyTitle: string; sellTitle: string; businessBuyBody: string;
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
      offers: string; live: string; noneLive: string;
    };
  } };

export const TRADE_ENTRY_COPY: Record<Locale, Copy> = {
  en: {
    startHere: 'Start here',
    options: 'Optional request settings',
    title: 'Start a trade',
    body: 'Tell Karwan what you need or offer. Review the match and agree the deal before payment.',
    sell: 'Find customers', sellBody: 'List your product or service so buyers on Karwan can find you.',
    buy: 'Find something to buy', buyBody: 'Describe what you need, your budget and your deadline.',
    businessBuyBody: 'Browse what businesses offer on Karwan, then agree a deal.',
    agreement: 'I already have an agreement',
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
      hub: { yours: 'Your trading', trades: 'Active trades', yourMove: '{n} waiting on you', noMove: 'Nothing waiting on you', requests: 'Your requests', noneOpen: 'Nothing open', offersIn: '{n} offers in', offersInOne: '1 offer in', noOffers: 'No offers yet', offers: 'Your offers', live: 'Live on the market', noneLive: 'Nothing live' },
    },
  },
  fr: {
    startHere: 'Commencez ici',
    options: 'Réglages facultatifs de la demande',
    title: 'Commencer un échange',
    body: 'Dites à Karwan ce que vous cherchez ou proposez. Examinez la mise en relation et convenez des conditions avant de payer.',
    sell: 'Trouver des clients', sellBody: 'Publiez votre produit ou service pour que les acheteurs sur Karwan vous trouvent.',
    buy: 'Trouver quoi acheter', buyBody: 'Décrivez votre besoin, votre budget et votre échéance.',
    businessBuyBody: 'Parcourez les offres des entreprises sur Karwan, puis convenez d’un accord.',
    agreement: 'J’ai déjà un accord',
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
      hub: { yours: 'Vos échanges', trades: 'Échanges en cours', yourMove: '{n} attendent votre action', noMove: 'Rien n’attend votre action', requests: 'Vos demandes', noneOpen: 'Rien en cours', offersIn: '{n} offres reçues', offersInOne: '1 offre reçue', noOffers: 'Aucune offre pour l’instant', offers: 'Vos offres', live: 'En ligne sur le marché', noneLive: 'Rien en ligne' },
    },
  },
  ar: {
    startHere: 'ابدأ هنا',
    options: 'إعدادات الطلب الاختيارية',
    title: 'ابدأ صفقة',
    body: 'أخبر Karwan بما تحتاجه أو تقدمه. راجع الطرف المقترح واتفق على الصفقة قبل الدفع.',
    sell: 'ابحث عن عملاء', sellBody: 'اعرض منتجك أو خدمتك ليجدك المشترون على Karwan.',
    buy: 'ابحث عما تشتريه', buyBody: 'صف ما تحتاجه وحدد ميزانيتك وموعد التسليم.',
    businessBuyBody: 'تصفح عروض الشركات على Karwan، ثم اتفق على صفقة.',
    agreement: 'لدي اتفاق بالفعل',
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
      hub: { yours: 'تداولاتك', trades: 'صفقات نشطة', yourMove: '{n} بانتظارك', noMove: 'لا شيء بانتظارك', requests: 'طلباتك', noneOpen: 'لا شيء مفتوح', offersIn: 'وصلت {n} عروض', offersInOne: 'وصل عرض واحد', noOffers: 'لا عروض بعد', offers: 'عروضك', live: 'معروضة في السوق', noneLive: 'لا شيء معروض' },
    },
  },
  hi: {
    startHere: 'यहाँ से शुरू करें',
    options: 'अनुरोध की वैकल्पिक सेटिंग',
    title: 'व्यापार शुरू करें',
    body: 'Karwan को बताएं कि आपको क्या चाहिए या आप क्या देते हैं। भुगतान से पहले मिलान देखें और सौदे की शर्तें तय करें।',
    sell: 'ग्राहक खोजें', sellBody: 'अपना उत्पाद या सेवा सूचीबद्ध करें ताकि Karwan के खरीदार आपको खोज सकें।',
    buy: 'खरीदने के लिए खोजें', buyBody: 'अपनी ज़रूरत, बजट और समय सीमा बताएं।',
    businessBuyBody: 'Karwan पर व्यवसायों की पेशकश देखें, फिर सौदे की शर्तें तय करें।',
    agreement: 'मेरा समझौता पहले से है',
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
      hub: { yours: 'आपका व्यापार', trades: 'सक्रिय सौदे', yourMove: '{n} आपकी प्रतीक्षा में', noMove: 'कुछ भी आपकी प्रतीक्षा में नहीं', requests: 'आपके अनुरोध', noneOpen: 'कुछ भी खुला नहीं', offersIn: '{n} ऑफ़र मिले', offersInOne: '1 ऑफ़र मिला', noOffers: 'अभी कोई ऑफ़र नहीं', offers: 'आपके ऑफ़र', live: 'बाज़ार में उपलब्ध', noneLive: 'कुछ भी उपलब्ध नहीं' },
    },
  },
  sw: {
    startHere: 'Anza hapa',
    options: 'Mipangilio ya hiari ya ombi',
    title: 'Anza biashara',
    body: 'Iambie Karwan unachohitaji au unachotoa. Kagua mlingano na ukubaliane kuhusu biashara kabla ya malipo.',
    sell: 'Tafuta wateja', sellBody: 'Orodhesha bidhaa au huduma yako ili wanunuzi wa Karwan wakupate.',
    buy: 'Tafuta cha kununua', buyBody: 'Eleza unachohitaji, bajeti yako na tarehe ya mwisho.',
    businessBuyBody: 'Angalia bidhaa na huduma za biashara kwenye Karwan, kisha ukubaliane kuhusu biashara.',
    agreement: 'Tayari nina makubaliano',
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
      hub: { yours: 'Biashara yako', trades: 'Biashara zinazoendelea', yourMove: '{n} zinakusubiri', noMove: 'Hakuna kinachokusubiri', requests: 'Maombi yako', noneOpen: 'Hakuna lililo wazi', offersIn: 'Ofa {n} zimefika', offersInOne: 'Ofa 1 imefika', noOffers: 'Bado hakuna ofa', offers: 'Ofa zako', live: 'Ziko sokoni', noneLive: 'Hakuna iliyo sokoni' },
    },
  },
};
