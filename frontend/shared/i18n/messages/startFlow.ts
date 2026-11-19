/// Sign-up to Home on /start, the Home cards, and the small fixes beside them
/// (docs/architecture/39-start-to-home.md).

export interface StartFlowCopy {
  bar: { step: string; account: string; tag: string; about: string };
  /// Who a nudge is from: Karwan before the account exists, the agent after.
  fromKarwan: string;
  fromAgent: string;
  /// The sign-up guide pop-up (view 54): its close button and the lines it
  /// says as the person acts.
  guideClose: string;
  guide: { wallet: string; codeLate: string; tagTaken: string; tagFree: string; country: string; countryUsdc: string };
  account: { title: string; body: string; nudge: string };
  code: { nudge: string };
  tag: { title: string; body: string; nudge: string; country: { label: string; search: string; none: string }; continueAs: string; agreeBefore: string; terms: string; and: string; privacy: string };
  home: {
    totalBalance: string;
    addMoney: string;
    firstTrade: { done: string; see: string; body: string };
    ask: { title: string; body: string; label: string; placeholder: string; send: string; chips: [string, string, string] };
    updatesAuto: string;
  };
  guarantee: { title: string; from: string; useAll: string; left: string };
  pager: { label: string; prev: string; next: string; range: string };
  privacy: { link: string; englishOnly: string };
}

export const startFlowCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', StartFlowCopy> = {
  en: {
    bar: { step: 'Step {n} of 3, {name}', account: 'your account', tag: 'your tag', about: 'about you' },
    fromKarwan: 'Karwan',
    fromAgent: 'Your agent',
    guideClose: "Hide guide",
    guide: { wallet: "Your wallet only signs you in. It won’t move money.", codeLate: "Not there? Check spam, or send a new code.", tagTaken: "@{tag} is taken. Try @{suggest}.", tagFree: "@{tag} is yours. Clients find and pay you by it.", country: "Prices will show in {currency}. Change it any time in Settings.", countryUsdc: "Prices will show in USDC for now." },
    account: {
      title: 'Get paid safely, anywhere.',
      body: 'Create your Karwan. It takes about a minute.',
      nudge: 'We only need your email or wallet to sign you in. Your name and ID are asked once, later, and only if a feature needs an identity check.',
    },
    code: { nudge: 'Check your inbox. If it is not there, look in spam.' },
    tag: {
      country: { label: "Country", search: "e.g. United Kingdom", none: "No country matches" },
      title: 'Pick your Karwan tag',
      body: 'Clients find you and pay you by it.',
      nudge: 'Short and easy to say works best. It goes on your deal links and your public record.',
      continueAs: 'Continue as @{tag}',
      agreeBefore: 'I agree to the',
      terms: 'terms',
      and: 'and',
      privacy: 'privacy notice',
    },
    home: {
      totalBalance: 'Total balance',
      addMoney: 'Add money',
      firstTrade: {
        done: '{done} of {total} done',
        see: 'See all steps',
        body: 'Every deal you finish builds your record.',
      },
      ask: {
        title: 'Ask Aman',
        body: 'Your assistant. It can post, pay and check deals for you.',
        label: 'Ask Aman',
        placeholder: 'What do you want to do?',
        send: 'Send',
        chips: ['Post my offer', 'Request a payment', 'Check a deal'],
      },
      updatesAuto: 'Moves on by itself. Point at it or focus it to stop.',
    },
    guarantee: { title: 'Add to your savings pocket', from: 'From your balance', useAll: 'Use all', left: '{amount} USDC left in your balance.' },
    pager: { label: 'Pages', prev: 'Previous', next: 'Next', range: '{from} to {to} of {total}' },
    privacy: { link: 'Privacy notice', englishOnly: 'This notice is in English.' },
  },
  fr: {
    bar: { step: 'Étape {n} sur 3, {name}', account: 'votre compte', tag: 'votre identifiant', about: 'vous' },
    fromKarwan: 'Karwan',
    fromAgent: 'Votre agent',
    guideClose: "Masquer le guide",
    guide: { wallet: "Votre portefeuille sert seulement à vous connecter. Il ne déplace pas d’argent.", codeLate: "Pas reçu ? Regardez dans les spams ou demandez un nouveau code.", tagTaken: "@{tag} est pris. Essayez @{suggest}.", tagFree: "@{tag} est à vous. Vos clients vous trouvent et vous paient avec.", country: "Les prix s’afficheront en {currency}. Modifiable à tout moment dans Réglages.", countryUsdc: "Les prix s’afficheront en USDC pour le moment." },
    account: {
      title: 'Soyez payé en sécurité, partout.',
      body: 'Créez votre Karwan. Environ une minute.',
      nudge: 'Il nous faut seulement votre e-mail ou votre portefeuille pour vous connecter. Votre nom et vos papiers sont demandés une seule fois, plus tard, et seulement si une fonction exige une vérification d’identité.',
    },
    code: { nudge: 'Regardez votre boîte de réception. S’il n’y est pas, regardez dans les spams.' },
    tag: {
      country: { label: "Pays", search: "ex. Royaume-Uni", none: "Aucun pays ne correspond" },
      title: 'Choisissez votre identifiant Karwan',
      body: 'Vos clients vous trouvent et vous paient avec.',
      nudge: 'Court et facile à dire, c’est le mieux. Il figure sur vos liens d’accord et votre historique public.',
      continueAs: 'Continuer en tant que @{tag}',
      agreeBefore: 'J’accepte les',
      terms: 'CGU',
      and: 'et la',
      privacy: 'confidentialité',
    },
    home: {
      totalBalance: 'Solde total',
      addMoney: 'Ajouter',
      firstTrade: {
        done: '{done} sur {total} faits',
        see: 'Voir toutes les étapes',
        body: 'Chaque accord terminé construit votre historique.',
      },
      ask: {
        title: 'Demandez à Aman',
        body: 'Votre assistant. Il peut publier, payer et suivre vos accords.',
        label: 'Demandez à Aman',
        placeholder: 'Que voulez-vous faire ?',
        send: 'Envoyer',
        chips: ['Publier mon offre', 'Demander un paiement', 'Suivre un accord'],
      },
      updatesAuto: 'Défile tout seul. Pointez ou sélectionnez pour l’arrêter.',
    },
    guarantee: { title: 'Alimenter votre poche d’épargne', from: 'Depuis votre solde', useAll: 'Tout utiliser', left: 'Il restera {amount} USDC sur votre solde.' },
    pager: { label: 'Pages', prev: 'Précédent', next: 'Suivant', range: '{from} à {to} sur {total}' },
    privacy: { link: 'Avis de confidentialité', englishOnly: 'Cet avis est en anglais. Le texte anglais fait foi.' },
  },
  ar: {
    bar: { step: 'الخطوة {n} من 3، {name}', account: 'حسابك', tag: 'معرّفك', about: 'عنك' },
    fromKarwan: 'Karwan',
    fromAgent: 'وكيلك',
    guideClose: "إخفاء الدليل",
    guide: { wallet: "محفظتك تُستخدم لتسجيل الدخول فقط. لا تنقل أي أموال.", codeLate: "لم يصل؟ تحقق من البريد العشوائي أو اطلب رمزًا جديدًا.", tagTaken: "@{tag} محجوز. جرّب @{suggest}.", tagFree: "@{tag} لك. يجدك العملاء ويدفعون لك به.", country: "ستظهر الأسعار بـ{currency}. يمكنك تغييرها في أي وقت من الإعدادات.", countryUsdc: "ستظهر الأسعار بالـUSDC حاليًا." },
    account: {
      title: 'احصل على أجرك بأمان، من أي مكان.',
      body: 'أنشئ حسابك في Karwan. يستغرق نحو دقيقة.',
      nudge: 'نحتاج فقط بريدك أو محفظتك لتسجيل دخولك. يُطلب اسمك وهويتك مرة واحدة لاحقًا، وفقط إن احتاجت ميزة إلى التحقق من الهوية.',
    },
    code: { nudge: 'افحص بريدك الوارد. إن لم تجده، انظر في الرسائل غير المرغوب فيها.' },
    tag: {
      country: { label: "الدولة", search: "مثال: المملكة المتحدة", none: "لا توجد دولة مطابقة" },
      title: 'اختر معرّفك في Karwan',
      body: 'به يجدك عملاؤك ويدفعون لك.',
      nudge: 'الأفضل أن يكون قصيرًا وسهل النطق. يظهر على روابط صفقاتك وسجلك العام.',
      continueAs: 'المتابعة باسم ‎@{tag}',
      agreeBefore: 'أوافق على',
      terms: 'الشروط',
      and: 'وعلى',
      privacy: 'إشعار الخصوصية',
    },
    home: {
      totalBalance: 'الرصيد الكلي',
      addMoney: 'إضافة',
      firstTrade: {
        done: 'أُنجز {done} من {total}',
        see: 'عرض كل الخطوات',
        body: 'كل صفقة تُتمّها تبني سجلك.',
      },
      ask: {
        title: 'اسأل أمان',
        body: 'مساعدك. يمكنه النشر والدفع ومتابعة الصفقات نيابة عنك.',
        label: 'اسأل أمان',
        placeholder: 'ماذا تريد أن تفعل؟',
        send: 'إرسال',
        chips: ['انشر عرضي', 'اطلب دفعة', 'تابع صفقة'],
      },
      updatesAuto: 'يتقدم وحده. أشر إليه أو حدّده ليتوقف.',
    },
    guarantee: { title: 'أضف إلى جيب ادخارك', from: 'من رصيدك', useAll: 'استخدم الكل', left: 'يبقى {amount} USDC في رصيدك.' },
    pager: { label: 'الصفحات', prev: 'السابق', next: 'التالي', range: '{from} إلى {to} من {total}' },
    privacy: { link: 'إشعار الخصوصية', englishOnly: 'هذا الإشعار بالإنجليزية. النص الإنجليزي هو المعتمد.' },
  },
  hi: {
    bar: { step: '3 में से चरण {n}, {name}', account: 'आपका खाता', tag: 'आपका टैग', about: 'आपके बारे में' },
    fromKarwan: 'Karwan',
    fromAgent: 'आपका एजेंट',
    guideClose: "गाइड छिपाएँ",
    guide: { wallet: "आपका वॉलेट सिर्फ़ साइन इन करता है। यह पैसे नहीं भेजता।", codeLate: "नहीं मिला? स्पैम देखें या नया कोड भेजें।", tagTaken: "@{tag} लिया जा चुका है। @{suggest} आज़माएँ।", tagFree: "@{tag} आपका है। ग्राहक इसी से आपको ढूँढते और भुगतान करते हैं।", country: "कीमतें {currency} में दिखेंगी। इसे कभी भी सेटिंग्स में बदलें।", countryUsdc: "अभी कीमतें USDC में दिखेंगी।" },
    account: {
      title: 'कहीं से भी, सुरक्षित भुगतान पाएँ।',
      body: 'अपना Karwan बनाएँ। लगभग एक मिनट लगता है।',
      nudge: 'साइन इन के लिए हमें बस आपका ईमेल या वॉलेट चाहिए। आपका नाम और पहचान पत्र बाद में एक बार पूछा जाता है, और सिर्फ़ तब जब किसी सुविधा को पहचान जाँच चाहिए।',
    },
    code: { nudge: 'अपना इनबॉक्स देखें। वहाँ न हो तो स्पैम में देखें।' },
    tag: {
      country: { label: "देश", search: "जैसे यूनाइटेड किंगडम", none: "कोई देश नहीं मिला" },
      title: 'अपना Karwan टैग चुनें',
      body: 'ग्राहक इसी से आपको ढूँढते और भुगतान करते हैं।',
      nudge: 'छोटा और बोलने में आसान सबसे अच्छा है। यह आपके डील लिंक और सार्वजनिक रिकॉर्ड पर दिखता है।',
      continueAs: '@{tag} के रूप में आगे बढ़ें',
      agreeBefore: 'मैं सहमत हूँ:',
      terms: 'शर्तें',
      and: 'और',
      privacy: 'गोपनीयता सूचना',
    },
    home: {
      totalBalance: 'कुल बैलेंस',
      addMoney: 'जोड़ें',
      firstTrade: {
        done: '{total} में से {done} पूरे',
        see: 'सभी चरण देखें',
        body: 'हर पूरी डील आपका रिकॉर्ड बनाती है।',
      },
      ask: {
        title: 'अमान से पूछें',
        body: 'आपका असिस्टेंट। यह आपके लिए पोस्ट, भुगतान और डील की जाँच कर सकता है।',
        label: 'अमान से पूछें',
        placeholder: 'आप क्या करना चाहते हैं?',
        send: 'भेजें',
        chips: ['मेरा ऑफ़र पोस्ट करें', 'भुगतान माँगें', 'डील की जाँच करें'],
      },
      updatesAuto: 'अपने आप आगे बढ़ता है। रोकने के लिए उस पर पॉइंटर या फ़ोकस रखें।',
    },
    guarantee: { title: 'अपनी बचत पॉकेट में जोड़ें', from: 'आपके बैलेंस से', useAll: 'सब इस्तेमाल करें', left: 'आपके बैलेंस में {amount} USDC बचेंगे।' },
    pager: { label: 'पेज', prev: 'पिछला', next: 'अगला', range: '{total} में से {from} से {to}' },
    privacy: { link: 'गोपनीयता सूचना', englishOnly: 'यह सूचना अंग्रेज़ी में है। अंग्रेज़ी पाठ ही मान्य है।' },
  },
  sw: {
    bar: { step: 'Hatua {n} kati ya 3, {name}', account: 'akaunti yako', tag: 'jina lako', about: 'kuhusu wewe' },
    fromKarwan: 'Karwan',
    fromAgent: 'Wakala wako',
    guideClose: "Ficha mwongozo",
    guide: { wallet: "Pochi yako inakuingiza tu. Haihamishi pesa.", codeLate: "Haijafika? Angalia spam, au tuma msimbo mpya.", tagTaken: "@{tag} imeshachukuliwa. Jaribu @{suggest}.", tagFree: "@{tag} ni yako. Wateja wanakupata na kukulipa kwayo.", country: "Bei zitaonyeshwa kwa {currency}. Ibadilishe wakati wowote kwenye Mipangilio.", countryUsdc: "Kwa sasa bei zitaonyeshwa kwa USDC." },
    account: {
      title: 'Lipwa kwa usalama, popote.',
      body: 'Fungua Karwan yako. Inachukua kama dakika moja.',
      nudge: 'Tunahitaji barua pepe au pochi yako tu ili kukuingiza. Jina na kitambulisho chako huulizwa mara moja baadaye, na tu ikiwa huduma inahitaji uthibitisho wa utambulisho.',
    },
    code: { nudge: 'Angalia kikasha chako. Kama haipo, angalia kwenye barua taka.' },
    tag: {
      country: { label: "Nchi", search: "mf. Uingereza", none: "Hakuna nchi inayolingana" },
      title: 'Chagua jina lako la Karwan',
      body: 'Wateja wanakupata na kukulipa kwa jina hili.',
      nudge: 'Fupi na rahisi kutamka ni bora. Linaonekana kwenye viungo vya mikataba yako na rekodi yako ya umma.',
      continueAs: 'Endelea kama @{tag}',
      agreeBefore: 'Nakubali',
      terms: 'masharti',
      and: 'na',
      privacy: 'sera ya faragha',
    },
    home: {
      totalBalance: 'Salio lote',
      addMoney: 'Ongeza',
      firstTrade: {
        done: '{done} kati ya {total} zimekamilika',
        see: 'Ona hatua zote',
        body: 'Kila mkataba unaokamilisha hujenga rekodi yako.',
      },
      ask: {
        title: 'Muulize Aman',
        body: 'Msaidizi wako. Anaweza kuchapisha, kulipa na kufuatilia mikataba kwa niaba yako.',
        label: 'Muulize Aman',
        placeholder: 'Unataka kufanya nini?',
        send: 'Tuma',
        chips: ['Chapisha ofa yangu', 'Omba malipo', 'Fuatilia mkataba'],
      },
      updatesAuto: 'Husogea yenyewe. Elekeza kiashiria au lenga ili kusimamisha.',
    },
    guarantee: { title: 'Ongeza kwenye mfuko wako wa akiba', from: 'Kutoka salio lako', useAll: 'Tumia yote', left: 'USDC {amount} zitabaki kwenye salio lako.' },
    pager: { label: 'Kurasa', prev: 'Iliyotangulia', next: 'Inayofuata', range: '{from} hadi {to} kati ya {total}' },
    privacy: { link: 'Taarifa ya faragha', englishOnly: 'Taarifa hii iko kwa Kiingereza. Maandishi ya Kiingereza ndiyo yanayotumika.' },
  },
};
