/// Sign-up to Home on /start, the Home cards, and the small fixes beside them
/// (docs/architecture/39-start-to-home.md).
type ByChoice<K extends string> = Record<K, string>;

export interface StartFlowCopy {
  bar: { step: string; account: string; tag: string; about: string };
  /// Who a nudge is from: Karwan before the account exists, the agent after.
  fromKarwan: string;
  fromAgent: string;
  account: { title: string; body: string; nudge: string };
  code: { nudge: string };
  tag: { title: string; body: string; nudge: string; continueAs: string; agreeBefore: string; terms: string; and: string; privacy: string };
  about: {
    hello: string;
    goalsHelp: string;
    work: {
      title: string;
      titleSell: string;
      whatLabel: string;
      whatLabelSell: string;
      priceLabel: string;
      waiting: string;
      reading: string;
      read: string;
      again: string;
      noPrice: string;
    };
    nudges: { buy: string; business: string; places: string };
    contact: {
      title: string;
      reachTitle: string;
      reachHelp: string;
      clients: ByChoice<'own' | 'find' | 'both'>;
      reach: ByChoice<'telegram' | 'email' | 'both'>;
    };
    summary: {
      title: string;
      body: string;
      rows: { tag: string; clients: string; agent: string; reach: string; paid: string };
      clients: ByChoice<'own' | 'find' | 'both'>;
      change: string;
      firstOffer: string;
      firstRequest: string;
      postNow: string;
      done: string;
      saving: string;
    };
  };
  home: {
    totalBalance: string;
    addMoney: string;
    firstTrade: { done: string; next: string; see: string; body: string; nextLabels: ByChoice<'setup' | 'money' | 'telegram' | 'connect' | 'deal' | 'finish'> };
    ask: { title: string; body: string; label: string; placeholder: string; send: string; chips: [string, string] };
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
    account: {
      title: 'Get paid safely, anywhere.',
      body: 'Create your Karwan. It takes about a minute.',
      nudge: 'We only need your email or wallet to sign you in. Your name and ID are asked once, later, and only if a feature needs an identity check.',
    },
    code: { nudge: 'Check your inbox. If it is not there, look in spam.' },
    tag: {
      title: 'Pick your Karwan tag',
      body: 'Clients find you and pay you by it.',
      nudge: 'Short and easy to say works best. It goes on your deal links and your public record.',
      continueAs: 'Continue as @{tag}',
      agreeBefore: 'I agree to the',
      terms: 'terms',
      and: 'and have read the',
      privacy: 'privacy notice',
    },
    about: {
      hello: "Hi @{tag}. I'm your agent. A few quick questions and your Karwan is ready.",
      goalsHelp: 'Pick all that fit.',
      work: {
        title: 'What do you do, and what do you usually charge?',
        titleSell: 'What do you sell, and at what price?',
        whatLabel: 'What you do',
        whatLabelSell: 'What you sell',
        priceLabel: 'Usual price and delivery time',
        waiting: "Say it the way you would to a client. I'll write your offer from it.",
        reading: 'Reading that…',
        read: "Got it. I'll offer this for you:",
        again: 'Not right? Just type it again.',
        noPrice: 'I could not read a price there. Try something like 20 to 40 USDC, 3 days.',
      },
      nudges: {
        buy: "I'll look for sellers who match and show you before anything is agreed.",
        business: 'This starts your business profile. You can add more later.',
        places: 'You can prove these accounts are yours later. Only proven ones count toward your record.',
      },
      contact: {
        title: 'Do you have clients already?',
        reachTitle: 'How should we reach you?',
        reachHelp: 'Only when a deal or payment needs you.',
        clients: {
          own: "I'll put payment requests and deal links first on your Home.",
          find: "I'll look for requests on the market that fit you.",
          both: "I'll look for requests that fit, and give you a deal link for the clients you have.",
        },
        reach: {
          telegram: "I'll message you on Telegram when something needs you.",
          email: "I'll send a short email when something needs you.",
          both: 'Telegram first, and email as a backup.',
        },
      },
      summary: {
        title: "Here's your Karwan",
        body: 'Nothing is saved until you say so. You can change any of this later on your profile.',
        rows: { tag: 'Tag', clients: 'Clients', agent: 'Your agent', reach: 'Reach you', paid: 'Paid' },
        clients: { own: 'Your own clients', find: 'New clients from the market', both: 'Yours, and new ones' },
        change: 'Change',
        firstOffer: 'Your first offer',
        firstRequest: 'Your first request',
        postNow: 'Post it on the market now',
        done: 'Looks right, take me home',
        saving: 'Setting up your Karwan…',
      },
    },
    home: {
      totalBalance: 'Total balance',
      addMoney: 'Add money',
      firstTrade: {
        done: '{done} of {total} done',
        next: 'Next: {step}',
        see: 'See the steps',
        body: 'Every deal you finish builds your record.',
        nextLabels: { setup: 'tell your agent about your work', money: 'add USDC', telegram: 'connect Telegram', connect: 'connect the places you work', deal: 'start a deal', finish: 'finish your first deal' },
      },
      ask: {
        title: 'Ask your assistant',
        body: 'It can post, pay and check deals for you.',
        label: 'Ask your assistant',
        placeholder: 'What do you want to do?',
        send: 'Send',
        chips: ['Post my offer', 'Request a payment'],
      },
      updatesAuto: 'Moves on by itself. Point at it or focus it to stop.',
    },
    guarantee: { title: 'Put up a deal guarantee', from: 'From your balance', useAll: 'Use all', left: '{amount} USDC left in your balance.' },
    pager: { label: 'Pages', prev: 'Previous', next: 'Next', range: '{from} to {to} of {total}' },
    privacy: { link: 'Privacy notice', englishOnly: 'This notice is in English.' },
  },
  fr: {
    bar: { step: 'Étape {n} sur 3, {name}', account: 'votre compte', tag: 'votre identifiant', about: 'vous' },
    fromKarwan: 'Karwan',
    fromAgent: 'Votre agent',
    account: {
      title: 'Soyez payé en sécurité, partout.',
      body: 'Créez votre Karwan. Environ une minute.',
      nudge: 'Il nous faut seulement votre e-mail ou votre portefeuille pour vous connecter. Votre nom et vos papiers sont demandés une seule fois, plus tard, et seulement si une fonction exige une vérification d’identité.',
    },
    code: { nudge: 'Regardez votre boîte de réception. S’il n’y est pas, regardez dans les spams.' },
    tag: {
      title: 'Choisissez votre identifiant Karwan',
      body: 'Vos clients vous trouvent et vous paient avec.',
      nudge: 'Court et facile à dire, c’est le mieux. Il figure sur vos liens d’accord et votre historique public.',
      continueAs: 'Continuer en tant que @{tag}',
      agreeBefore: 'J’accepte les',
      terms: 'conditions',
      and: 'et j’ai lu l’',
      privacy: 'avis de confidentialité',
    },
    about: {
      hello: 'Bonjour @{tag}. Je suis votre agent. Quelques questions rapides et votre Karwan est prêt.',
      goalsHelp: 'Choisissez tout ce qui vous correspond.',
      work: {
        title: 'Que faites-vous, et quel est votre prix habituel ?',
        titleSell: 'Que vendez-vous, et à quel prix ?',
        whatLabel: 'Ce que vous faites',
        whatLabelSell: 'Ce que vous vendez',
        priceLabel: 'Prix habituel et délai',
        waiting: 'Dites-le comme à un client. J’écris votre offre à partir de ça.',
        reading: 'Je lis…',
        read: 'Compris. Je propose ceci pour vous :',
        again: 'Pas tout à fait ? Écrivez-le à nouveau.',
        noPrice: 'Je n’ai pas pu lire de prix. Essayez par exemple 20 à 40 USDC, 3 jours.',
      },
      nudges: {
        buy: 'Je cherche des vendeurs qui correspondent et je vous les montre avant tout accord.',
        business: 'Cela commence votre profil d’entreprise. Vous pourrez compléter plus tard.',
        places: 'Vous pourrez prouver plus tard que ces comptes sont à vous. Seuls les comptes prouvés comptent.',
      },
      contact: {
        title: 'Avez-vous déjà des clients ?',
        reachTitle: 'Comment vous joindre ?',
        reachHelp: 'Seulement quand un accord ou un paiement a besoin de vous.',
        clients: {
          own: 'Je mets les demandes de paiement et les liens d’accord en premier sur votre accueil.',
          find: 'Je cherche sur le marché les demandes qui vous correspondent.',
          both: 'Je cherche les demandes qui vous correspondent, et je vous donne un lien d’accord pour vos clients.',
        },
        reach: {
          telegram: 'Je vous écris sur Telegram quand quelque chose a besoin de vous.',
          email: 'Je vous envoie un court e-mail quand quelque chose a besoin de vous.',
          both: 'Telegram d’abord, l’e-mail en secours.',
        },
      },
      summary: {
        title: 'Voici votre Karwan',
        body: 'Rien n’est enregistré avant votre accord. Vous pourrez tout changer plus tard sur votre profil.',
        rows: { tag: 'Identifiant', clients: 'Clients', agent: 'Votre agent', reach: 'Vous joindre', paid: 'Paiement' },
        clients: { own: 'Vos propres clients', find: 'De nouveaux clients du marché', both: 'Les vôtres, et de nouveaux' },
        change: 'Changer',
        firstOffer: 'Votre première offre',
        firstRequest: 'Votre première demande',
        postNow: 'La publier sur le marché maintenant',
        done: 'C’est bon, à l’accueil',
        saving: 'Configuration de votre Karwan…',
      },
    },
    home: {
      totalBalance: 'Solde total',
      addMoney: 'Ajouter',
      firstTrade: {
        done: '{done} sur {total} faits',
        next: 'Ensuite : {step}',
        see: 'Voir les étapes',
        body: 'Chaque accord terminé construit votre historique.',
        nextLabels: { setup: 'parler de votre travail à votre agent', money: 'ajouter des USDC', telegram: 'connecter Telegram', connect: 'connecter vos lieux de travail', deal: 'lancer un accord', finish: 'terminer votre premier accord' },
      },
      ask: {
        title: 'Demandez à votre assistant',
        body: 'Il peut publier, payer et suivre vos accords.',
        label: 'Demandez à votre assistant',
        placeholder: 'Que voulez-vous faire ?',
        send: 'Envoyer',
        chips: ['Publier mon offre', 'Demander un paiement'],
      },
      updatesAuto: 'Défile tout seul. Pointez ou sélectionnez pour l’arrêter.',
    },
    guarantee: { title: 'Déposer une garantie d’accord', from: 'Depuis votre solde', useAll: 'Tout utiliser', left: 'Il restera {amount} USDC sur votre solde.' },
    pager: { label: 'Pages', prev: 'Précédent', next: 'Suivant', range: '{from} à {to} sur {total}' },
    privacy: { link: 'Avis de confidentialité', englishOnly: 'Cet avis est en anglais. Le texte anglais fait foi.' },
  },
  ar: {
    bar: { step: 'الخطوة {n} من 3، {name}', account: 'حسابك', tag: 'معرّفك', about: 'عنك' },
    fromKarwan: 'Karwan',
    fromAgent: 'وكيلك',
    account: {
      title: 'احصل على أجرك بأمان، من أي مكان.',
      body: 'أنشئ حسابك في Karwan. يستغرق نحو دقيقة.',
      nudge: 'نحتاج فقط بريدك أو محفظتك لتسجيل دخولك. يُطلب اسمك وهويتك مرة واحدة لاحقًا، وفقط إن احتاجت ميزة إلى التحقق من الهوية.',
    },
    code: { nudge: 'افحص بريدك الوارد. إن لم تجده، انظر في الرسائل غير المرغوب فيها.' },
    tag: {
      title: 'اختر معرّفك في Karwan',
      body: 'به يجدك عملاؤك ويدفعون لك.',
      nudge: 'الأفضل أن يكون قصيرًا وسهل النطق. يظهر على روابط صفقاتك وسجلك العام.',
      continueAs: 'المتابعة باسم ‎@{tag}',
      agreeBefore: 'أوافق على',
      terms: 'الشروط',
      and: 'وقرأت',
      privacy: 'إشعار الخصوصية',
    },
    about: {
      hello: 'مرحبًا ‎@{tag}. أنا وكيلك. بضعة أسئلة سريعة ويصبح حسابك جاهزًا.',
      goalsHelp: 'اختر كل ما ينطبق.',
      work: {
        title: 'ماذا تعمل، وكم تتقاضى عادة؟',
        titleSell: 'ماذا تبيع، وبأي سعر؟',
        whatLabel: 'ما تعمله',
        whatLabelSell: 'ما تبيعه',
        priceLabel: 'السعر المعتاد ومدة التسليم',
        waiting: 'قلها كما تقولها لعميل. سأكتب عرضك منها.',
        reading: 'أقرأ…',
        read: 'فهمت. سأعرض هذا نيابة عنك:',
        again: 'ليس صحيحًا؟ اكتبه مرة أخرى.',
        noPrice: 'لم أتمكن من قراءة سعر. جرّب مثلًا 20 إلى 40 USDC، 3 أيام.',
      },
      nudges: {
        buy: 'سأبحث عن بائعين مناسبين وأعرضهم عليك قبل أي اتفاق.',
        business: 'بهذا يبدأ ملف نشاطك التجاري. يمكنك الإضافة لاحقًا.',
        places: 'يمكنك لاحقًا إثبات أن هذه الحسابات لك. لا يُحتسب في سجلك إلا ما تثبته.',
      },
      contact: {
        title: 'هل لديك عملاء بالفعل؟',
        reachTitle: 'كيف نتواصل معك؟',
        reachHelp: 'فقط عندما تحتاجك صفقة أو دفعة.',
        clients: {
          own: 'سأضع طلبات الدفع وروابط الصفقات أولًا في صفحتك الرئيسية.',
          find: 'سأبحث في السوق عن طلبات تناسبك.',
          both: 'سأبحث عن طلبات تناسبك، وأعطيك رابط صفقة لعملائك الحاليين.',
        },
        reach: {
          telegram: 'سأراسلك على Telegram عندما يحتاجك أمر ما.',
          email: 'سأرسل بريدًا قصيرًا عندما يحتاجك أمر ما.',
          both: 'Telegram أولًا، والبريد احتياطًا.',
        },
      },
      summary: {
        title: 'هذا حسابك في Karwan',
        body: 'لا يُحفظ شيء حتى توافق. يمكنك تغيير أي شيء لاحقًا من ملفك.',
        rows: { tag: 'المعرّف', clients: 'العملاء', agent: 'وكيلك', reach: 'التواصل', paid: 'الدفع' },
        clients: { own: 'عملاؤك', find: 'عملاء جدد من السوق', both: 'عملاؤك، وعملاء جدد' },
        change: 'تغيير',
        firstOffer: 'عرضك الأول',
        firstRequest: 'طلبك الأول',
        postNow: 'انشره في السوق الآن',
        done: 'صحيح، خذني إلى الرئيسية',
        saving: 'جارٍ إعداد حسابك…',
      },
    },
    home: {
      totalBalance: 'الرصيد الكلي',
      addMoney: 'إضافة',
      firstTrade: {
        done: 'أُنجز {done} من {total}',
        next: 'التالي: {step}',
        see: 'عرض الخطوات',
        body: 'كل صفقة تُتمّها تبني سجلك.',
        nextLabels: { setup: 'أخبر وكيلك عن عملك', money: 'أضف USDC', telegram: 'اربط Telegram', connect: 'اربط أماكن عملك', deal: 'ابدأ صفقة', finish: 'أتمّ صفقتك الأولى' },
      },
      ask: {
        title: 'اسأل مساعدك',
        body: 'يمكنه النشر والدفع ومتابعة الصفقات نيابة عنك.',
        label: 'اسأل مساعدك',
        placeholder: 'ماذا تريد أن تفعل؟',
        send: 'إرسال',
        chips: ['انشر عرضي', 'اطلب دفعة'],
      },
      updatesAuto: 'يتقدم وحده. أشر إليه أو حدّده ليتوقف.',
    },
    guarantee: { title: 'ضع ضمان صفقة', from: 'من رصيدك', useAll: 'استخدم الكل', left: 'يبقى {amount} USDC في رصيدك.' },
    pager: { label: 'الصفحات', prev: 'السابق', next: 'التالي', range: '{from} إلى {to} من {total}' },
    privacy: { link: 'إشعار الخصوصية', englishOnly: 'هذا الإشعار بالإنجليزية. النص الإنجليزي هو المعتمد.' },
  },
  hi: {
    bar: { step: '3 में से चरण {n}, {name}', account: 'आपका खाता', tag: 'आपका टैग', about: 'आपके बारे में' },
    fromKarwan: 'Karwan',
    fromAgent: 'आपका एजेंट',
    account: {
      title: 'कहीं से भी, सुरक्षित भुगतान पाएँ।',
      body: 'अपना Karwan बनाएँ। लगभग एक मिनट लगता है।',
      nudge: 'साइन इन के लिए हमें बस आपका ईमेल या वॉलेट चाहिए। आपका नाम और पहचान पत्र बाद में एक बार पूछा जाता है, और सिर्फ़ तब जब किसी सुविधा को पहचान जाँच चाहिए।',
    },
    code: { nudge: 'अपना इनबॉक्स देखें। वहाँ न हो तो स्पैम में देखें।' },
    tag: {
      title: 'अपना Karwan टैग चुनें',
      body: 'ग्राहक इसी से आपको ढूँढते और भुगतान करते हैं।',
      nudge: 'छोटा और बोलने में आसान सबसे अच्छा है। यह आपके डील लिंक और सार्वजनिक रिकॉर्ड पर दिखता है।',
      continueAs: '@{tag} के रूप में आगे बढ़ें',
      agreeBefore: 'मैं',
      terms: 'शर्तों',
      and: 'से सहमत हूँ और मैंने पढ़ा है',
      privacy: 'गोपनीयता सूचना',
    },
    about: {
      hello: 'नमस्ते @{tag}। मैं आपका एजेंट हूँ। कुछ छोटे सवाल और आपका Karwan तैयार।',
      goalsHelp: 'जो भी लागू हो, सब चुनें।',
      work: {
        title: 'आप क्या करते हैं, और आमतौर पर कितना लेते हैं?',
        titleSell: 'आप क्या बेचते हैं, और किस कीमत पर?',
        whatLabel: 'आप क्या करते हैं',
        whatLabelSell: 'आप क्या बेचते हैं',
        priceLabel: 'सामान्य कीमत और डिलीवरी का समय',
        waiting: 'जैसे किसी ग्राहक से कहते हैं, वैसे लिखें। मैं उसी से आपका ऑफ़र लिखूँगा।',
        reading: 'पढ़ रहा हूँ…',
        read: 'समझ गया। मैं आपके लिए यह पेश करूँगा:',
        again: 'सही नहीं? फिर से लिखें।',
        noPrice: 'मैं वहाँ कीमत नहीं पढ़ पाया। ऐसे लिखें: 20 से 40 USDC, 3 दिन।',
      },
      nudges: {
        buy: 'मैं मेल खाते विक्रेता ढूँढूँगा और कुछ भी तय होने से पहले आपको दिखाऊँगा।',
        business: 'इससे आपकी व्यवसाय प्रोफ़ाइल शुरू होती है। बाद में और जोड़ सकते हैं।',
        places: 'आप बाद में साबित कर सकते हैं कि ये खाते आपके हैं। सिर्फ़ साबित खाते रिकॉर्ड में गिने जाते हैं।',
      },
      contact: {
        title: 'क्या आपके पास पहले से ग्राहक हैं?',
        reachTitle: 'हम आप तक कैसे पहुँचें?',
        reachHelp: 'सिर्फ़ तब जब किसी डील या भुगतान को आपकी ज़रूरत हो।',
        clients: {
          own: 'मैं आपके होम पर भुगतान अनुरोध और डील लिंक सबसे पहले रखूँगा।',
          find: 'मैं बाज़ार में आपसे मेल खाते अनुरोध ढूँढूँगा।',
          both: 'मैं मेल खाते अनुरोध ढूँढूँगा, और आपके ग्राहकों के लिए डील लिंक दूँगा।',
        },
        reach: {
          telegram: 'ज़रूरत पड़ने पर मैं Telegram पर संदेश भेजूँगा।',
          email: 'ज़रूरत पड़ने पर मैं एक छोटा ईमेल भेजूँगा।',
          both: 'पहले Telegram, ईमेल बैकअप के रूप में।',
        },
      },
      summary: {
        title: 'यह रहा आपका Karwan',
        body: 'आपके कहे बिना कुछ सेव नहीं होता। बाद में प्रोफ़ाइल पर कुछ भी बदल सकते हैं।',
        rows: { tag: 'टैग', clients: 'ग्राहक', agent: 'आपका एजेंट', reach: 'संपर्क', paid: 'भुगतान' },
        clients: { own: 'आपके अपने ग्राहक', find: 'बाज़ार से नए ग्राहक', both: 'आपके, और नए' },
        change: 'बदलें',
        firstOffer: 'आपका पहला ऑफ़र',
        firstRequest: 'आपका पहला अनुरोध',
        postNow: 'इसे अभी बाज़ार में पोस्ट करें',
        done: 'सही है, होम पर चलें',
        saving: 'आपका Karwan सेट हो रहा है…',
      },
    },
    home: {
      totalBalance: 'कुल बैलेंस',
      addMoney: 'जोड़ें',
      firstTrade: {
        done: '{total} में से {done} पूरे',
        next: 'अगला: {step}',
        see: 'चरण देखें',
        body: 'हर पूरी डील आपका रिकॉर्ड बनाती है।',
        nextLabels: { setup: 'अपने एजेंट को अपने काम के बारे में बताएँ', money: 'USDC जोड़ें', telegram: 'Telegram जोड़ें', connect: 'अपने काम की जगहें जोड़ें', deal: 'डील शुरू करें', finish: 'अपनी पहली डील पूरी करें' },
      },
      ask: {
        title: 'अपने असिस्टेंट से पूछें',
        body: 'यह आपके लिए पोस्ट, भुगतान और डील की जाँच कर सकता है।',
        label: 'अपने असिस्टेंट से पूछें',
        placeholder: 'आप क्या करना चाहते हैं?',
        send: 'भेजें',
        chips: ['मेरा ऑफ़र पोस्ट करें', 'भुगतान माँगें'],
      },
      updatesAuto: 'अपने आप आगे बढ़ता है। रोकने के लिए उस पर पॉइंटर या फ़ोकस रखें।',
    },
    guarantee: { title: 'डील गारंटी रखें', from: 'आपके बैलेंस से', useAll: 'सब इस्तेमाल करें', left: 'आपके बैलेंस में {amount} USDC बचेंगे।' },
    pager: { label: 'पेज', prev: 'पिछला', next: 'अगला', range: '{total} में से {from} से {to}' },
    privacy: { link: 'गोपनीयता सूचना', englishOnly: 'यह सूचना अंग्रेज़ी में है। अंग्रेज़ी पाठ ही मान्य है।' },
  },
  sw: {
    bar: { step: 'Hatua {n} kati ya 3, {name}', account: 'akaunti yako', tag: 'jina lako', about: 'kuhusu wewe' },
    fromKarwan: 'Karwan',
    fromAgent: 'Wakala wako',
    account: {
      title: 'Lipwa kwa usalama, popote.',
      body: 'Fungua Karwan yako. Inachukua kama dakika moja.',
      nudge: 'Tunahitaji barua pepe au pochi yako tu ili kukuingiza. Jina na kitambulisho chako huulizwa mara moja baadaye, na tu ikiwa huduma inahitaji uthibitisho wa utambulisho.',
    },
    code: { nudge: 'Angalia kikasha chako. Kama haipo, angalia kwenye barua taka.' },
    tag: {
      title: 'Chagua jina lako la Karwan',
      body: 'Wateja wanakupata na kukulipa kwa jina hili.',
      nudge: 'Fupi na rahisi kutamka ni bora. Linaonekana kwenye viungo vya mikataba yako na rekodi yako ya umma.',
      continueAs: 'Endelea kama @{tag}',
      agreeBefore: 'Nakubali',
      terms: 'masharti',
      and: 'na nimesoma',
      privacy: 'taarifa ya faragha',
    },
    about: {
      hello: 'Habari @{tag}. Mimi ni wakala wako. Maswali machache ya haraka na Karwan yako iko tayari.',
      goalsHelp: 'Chagua yote yanayokufaa.',
      work: {
        title: 'Unafanya nini, na kwa kawaida unatoza kiasi gani?',
        titleSell: 'Unauza nini, na kwa bei gani?',
        whatLabel: 'Unachofanya',
        whatLabelSell: 'Unachouza',
        priceLabel: 'Bei ya kawaida na muda wa kuwasilisha',
        waiting: 'Sema kama unavyomwambia mteja. Nitaandika ofa yako kutokana na hilo.',
        reading: 'Ninasoma…',
        read: 'Nimeelewa. Nitatoa ofa hii kwa niaba yako:',
        again: 'Si sahihi? Andika tena.',
        noPrice: 'Sikuweza kusoma bei hapo. Jaribu kama USDC 20 hadi 40, siku 3.',
      },
      nudges: {
        buy: 'Nitatafuta wauzaji wanaolingana na kukuonyesha kabla ya makubaliano yoyote.',
        business: 'Hii inaanzisha wasifu wa biashara yako. Unaweza kuongeza zaidi baadaye.',
        places: 'Unaweza kuthibitisha baadaye kuwa akaunti hizi ni zako. Zilizothibitishwa tu ndizo huhesabiwa.',
      },
      contact: {
        title: 'Je, una wateja tayari?',
        reachTitle: 'Tukufikie vipi?',
        reachHelp: 'Tu pale mkataba au malipo yanapokuhitaji.',
        clients: {
          own: 'Nitaweka maombi ya malipo na viungo vya mikataba kwanza kwenye ukurasa wako wa nyumbani.',
          find: 'Nitatafuta maombi sokoni yanayokufaa.',
          both: 'Nitatafuta maombi yanayokufaa, na kukupa kiungo cha mkataba kwa wateja ulionao.',
        },
        reach: {
          telegram: 'Nitakutumia ujumbe Telegram jambo likikuhitaji.',
          email: 'Nitakutumia barua pepe fupi jambo likikuhitaji.',
          both: 'Telegram kwanza, barua pepe kama akiba.',
        },
      },
      summary: {
        title: 'Hii ndiyo Karwan yako',
        body: 'Hakuna kinachohifadhiwa hadi useme. Unaweza kubadilisha chochote baadaye kwenye wasifu wako.',
        rows: { tag: 'Jina', clients: 'Wateja', agent: 'Wakala wako', reach: 'Kukufikia', paid: 'Malipo' },
        clients: { own: 'Wateja wako', find: 'Wateja wapya kutoka sokoni', both: 'Wako, na wapya' },
        change: 'Badilisha',
        firstOffer: 'Ofa yako ya kwanza',
        firstRequest: 'Ombi lako la kwanza',
        postNow: 'Ichapishe sokoni sasa',
        done: 'Ni sahihi, nipeleke nyumbani',
        saving: 'Inaandaa Karwan yako…',
      },
    },
    home: {
      totalBalance: 'Salio lote',
      addMoney: 'Ongeza',
      firstTrade: {
        done: '{done} kati ya {total} zimekamilika',
        next: 'Inayofuata: {step}',
        see: 'Ona hatua',
        body: 'Kila mkataba unaokamilisha hujenga rekodi yako.',
        nextLabels: { setup: 'mweleze wakala wako kuhusu kazi yako', money: 'ongeza USDC', telegram: 'unganisha Telegram', connect: 'unganisha unakofanyia kazi', deal: 'anza mkataba', finish: 'kamilisha mkataba wako wa kwanza' },
      },
      ask: {
        title: 'Muulize msaidizi wako',
        body: 'Anaweza kuchapisha, kulipa na kufuatilia mikataba kwa niaba yako.',
        label: 'Muulize msaidizi wako',
        placeholder: 'Unataka kufanya nini?',
        send: 'Tuma',
        chips: ['Chapisha ofa yangu', 'Omba malipo'],
      },
      updatesAuto: 'Husogea yenyewe. Elekeza kiashiria au lenga ili kusimamisha.',
    },
    guarantee: { title: 'Weka dhamana ya mkataba', from: 'Kutoka salio lako', useAll: 'Tumia yote', left: 'USDC {amount} zitabaki kwenye salio lako.' },
    pager: { label: 'Kurasa', prev: 'Iliyotangulia', next: 'Inayofuata', range: '{from} hadi {to} kati ya {total}' },
    privacy: { link: 'Taarifa ya faragha', englishOnly: 'Taarifa hii iko kwa Kiingereza. Maandishi ya Kiingereza ndiyo yanayotumika.' },
  },
};
