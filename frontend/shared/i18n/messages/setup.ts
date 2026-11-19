/// The setup conversation after activation (view 19).
type Option = { label: string; note: string };
type Question = { title: string; help: string; example: string; examples: string[] };

export interface SetupCopy {
  later: string;
  progressLabel: string;
  progress: string;
  choices: {
    reach: { title: string; help: string; options: Record<'telegram' | 'email' | 'both', Option> };
  };
  reading: { title: string; body: string };
  summary: { title: string; body: string; looksRight: string; change: string };
  buttons: { back: string; skip: string; next: string };
  saveError: string;
  /// The button after activation, and the row under Me.
  start: string;
  meChange: string;
  /// Set up in two minutes (view 39, 19 Nov).
  quick: {
    roleTitle: string;
    roles: Record<'sell' | 'buy' | 'both', Option>;
    sellLabel: string;
    sellExample: string;
    sellExamples: string[];
    buyLabel: string;
    buyExample: string;
    buyExamples: string[];
    readAs: string;
    reading: string;
    lowest: string;
    usual: string;
    days: string;
    sameDay: string;
    range: string;
    noPrice: string;
    amanRole: string;
    amanSell: string;
    amanBuy: string;
    amanBoth: string;
    whereTitle: string;
    country: string;
    city: string;
    cityPlaceholder: string;
    useLocation: string;
    kept: string;
    finding: string;
    notFound: string;
    keepTyped: string;
    nearbySell: string;
    nearbyBuy: string;
    reachTitle: string;
    telegramNote: string;
    emailNote: string;
    amanWhere: string;
    summarySub: string;
    offer: string;
    request: string;
    newOn: string;
    delivers: string;
    upTo: string;
    postNow: string;
    rows: { tag: string; where: string; reach: string; agent: string };
    reachBoth: string;
    agentOffers: string;
    agentAsks: string;
    held: string;
    done: string;
    saving: string;
    change: string;
  };
  /// The Settings row for the reach answer.
  reachSetting: string;
}

export const setupCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', SetupCopy> = {
  en: {
    later: "I'll do this later",
    progressLabel: 'Setting up your Karwan',
    progress: '{index} of {total}',
    choices: {
      reach: { title: 'How should we reach you?', help: 'For new offers, payments and anything that needs you.', options: { telegram: { label: 'Telegram', note: 'Your agent works for you there too' }, email: { label: 'Email', note: 'A short note when something needs you' }, both: { label: 'Both', note: 'Telegram first, email as backup' } } },
    },
    reading: { title: 'Reading your answers', body: 'Setting up your agents and your Home.' },
    summary: { title: "Here's your Karwan", body: 'Check it. Nothing is saved until you say it looks right.', looksRight: 'Looks right', change: 'Change something' },
    buttons: { back: 'Back', skip: 'Skip', next: 'Next' },
    saveError: "That didn't save. Try again in a moment.",
    start: 'Set up my Karwan', meChange: 'Change how your agents work',
    quick: {
      roleTitle: 'What brings you to Karwan?',
      roles: { sell: { label: 'Sell', note: 'Your work or your goods' }, buy: { label: 'Buy or hire', note: 'Find someone and pay safely' }, both: { label: 'Both', note: 'Sell and buy' } },
      sellLabel: 'What you sell and your usual price',
      sellExample: 'Logo and brand design, 20 to 40 USDC, 3 days',
      sellExamples: ['Logo design, 20 to 40 USDC, 3 days', 'Phone repairs, about 10 USDC, same day', 'Ankara fabric, 15 USDC a piece'],
      buyLabel: 'What you need and your budget',
      buyExample: 'A designer for my brand, up to 50 USDC',
      buyExamples: ['A designer, up to 50 USDC', 'Phone repairs, up to 20 USDC', 'Rice from a supplier'],
      readAs: 'Your agent read it as',
      reading: 'Reading that…',
      lowest: '{money} lowest',
      usual: '{money} usual',
      days: '{n} days',
      sameDay: 'Same day',
      range: '{min} to {max}',
      noPrice: 'No price yet. Add one, or carry on and I will ask you before any deal.',
      amanRole: 'I use this to find people for you on the market.',
      amanSell: 'I offer your work at this price. You can change it any time.',
      amanBuy: 'I look for people who sell this and show you before anything is agreed.',
      amanBoth: 'I look for buyers for what you sell and sellers for what you need.',
      whereTitle: 'Where are you, and how should we reach you?',
      country: 'Country',
      city: 'City',
      cityPlaceholder: 'Your city or town',
      useLocation: 'Use my location',
      kept: 'Kept private',
      finding: 'Finding you…',
      notFound: "Couldn't find you. Pick your city instead.",
      keepTyped: 'Use {city}',
      nearbySell: 'people in {city} are asking for {what}',
      nearbyBuy: 'people in {city} sell {what}',
      reachTitle: 'How should we reach you',
      telegramNote: 'Your agent works there too',
      emailNote: 'A short note when something needs you',
      amanWhere: 'Only your country is shown. Your city helps me find people near you.',
      summarySub: 'This is what people will see on the market.',
      offer: 'Offer',
      request: 'Request',
      newOn: 'new on Karwan',
      delivers: 'Delivers in {days}',
      upTo: 'Up to {money}',
      postNow: 'Post it on the market now',
      rows: { tag: 'Tag', where: 'Where', reach: 'We reach you', agent: 'Your agent' },
      reachBoth: 'Telegram and email',
      agentOffers: 'Makes offers',
      agentAsks: 'Asks you first',
      held: 'When you agree a deal, the buyer’s money is held until the work is approved, then it goes to the seller.',
      done: 'Looks right, take me home',
      saving: 'Saving…',
      change: 'Change',
    },
    reachSetting: 'How we reach you',
  },
  fr: {
    later: 'Je le ferai plus tard',
    progressLabel: 'Configuration de votre Karwan',
    progress: '{index} sur {total}',
    choices: {
      reach: { title: 'Comment vous joindre ?', help: 'Pour les nouvelles offres, les paiements et tout ce qui a besoin de vous.', options: { telegram: { label: 'Telegram', note: 'Votre agent y travaille aussi pour vous' }, email: { label: 'E-mail', note: 'Un petit mot quand quelque chose a besoin de vous' }, both: { label: 'Les deux', note: 'Telegram d’abord, l’e-mail en secours' } } },
    },
    reading: { title: 'Lecture de vos réponses', body: 'Configuration de vos agents et de votre accueil.' },
    summary: { title: 'Voici votre Karwan', body: 'Vérifiez. Rien n’est enregistré avant que vous disiez que c’est bon.', looksRight: 'C’est bon', change: 'Changer quelque chose' },
    buttons: { back: 'Retour', skip: 'Passer', next: 'Suivant' },
    saveError: 'L’enregistrement a échoué. Réessayez dans un instant.',
    start: 'Configurer mon Karwan', meChange: 'Changer le travail de vos agents',
    quick: {
      roleTitle: 'Qu’est-ce qui vous amène sur Karwan ?',
      roles: { sell: { label: 'Vendre', note: 'Votre travail ou vos produits' }, buy: { label: 'Acheter ou embaucher', note: 'Trouver quelqu’un et payer en sécurité' }, both: { label: 'Les deux', note: 'Vendre et acheter' } },
      sellLabel: 'Ce que vous vendez et votre prix habituel',
      sellExample: 'Création de logo, 20 à 40 USDC, 3 jours',
      sellExamples: ['Création de logo, 20 à 40 USDC, 3 jours', 'Réparation de téléphones, environ 10 USDC, le jour même', 'Tissu ankara, 15 USDC la pièce'],
      buyLabel: 'Ce qu’il vous faut et votre budget',
      buyExample: 'Un designer pour ma marque, jusqu’à 50 USDC',
      buyExamples: ['Un designer, jusqu’à 50 USDC', 'Réparation de téléphone, jusqu’à 20 USDC', 'Du riz auprès d’un fournisseur'],
      readAs: 'Votre agent a compris',
      reading: 'Lecture…',
      lowest: '{money} minimum',
      usual: '{money} habituel',
      days: '{n} jours',
      sameDay: 'Le jour même',
      range: '{min} à {max}',
      noPrice: 'Pas encore de prix. Ajoutez-en un, ou continuez et je vous demanderai avant tout accord.',
      amanRole: 'Je m’en sers pour vous trouver des gens sur le marché.',
      amanSell: 'Je propose votre travail à ce prix. Vous pouvez le changer quand vous voulez.',
      amanBuy: 'Je cherche des gens qui vendent cela et je vous les montre avant tout accord.',
      amanBoth: 'Je cherche des acheteurs pour ce que vous vendez et des vendeurs pour ce qu’il vous faut.',
      whereTitle: 'Où êtes-vous, et comment vous joindre ?',
      country: 'Pays',
      city: 'Ville',
      cityPlaceholder: 'Votre ville',
      useLocation: 'Utiliser ma position',
      kept: 'Reste privé',
      finding: 'Recherche…',
      notFound: 'Position introuvable. Choisissez plutôt votre ville.',
      keepTyped: 'Utiliser {city}',
      nearbySell: 'personnes à {city} cherchent {what}',
      nearbyBuy: 'personnes à {city} vendent {what}',
      reachTitle: 'Comment vous joindre',
      telegramNote: 'Votre agent y travaille aussi',
      emailNote: 'Un court message quand on a besoin de vous',
      amanWhere: 'Seul votre pays est affiché. Votre ville m’aide à trouver des gens près de vous.',
      summarySub: 'Voici ce que les gens verront sur le marché.',
      offer: 'Offre',
      request: 'Demande',
      newOn: 'nouveau sur Karwan',
      delivers: 'Livré en {days}',
      upTo: 'Jusqu’à {money}',
      postNow: 'Publier maintenant sur le marché',
      rows: { tag: 'Identifiant', where: 'Où', reach: 'On vous joint par', agent: 'Votre agent' },
      reachBoth: 'Telegram et e-mail',
      agentOffers: 'Fait des offres',
      agentAsks: 'Vous demande d’abord',
      held: 'Quand vous concluez un accord, l’argent de l’acheteur est bloqué jusqu’à l’approbation du travail, puis il va au vendeur.',
      done: 'C’est bon, à l’accueil',
      saving: 'Enregistrement…',
      change: 'Changer',
    },
    reachSetting: 'Comment vous joindre',
  },
  ar: {
    later: 'سأفعل هذا لاحقًا',
    progressLabel: 'إعداد Karwan الخاص بك',
    progress: '{index} من {total}',
    choices: {
      reach: { title: 'كيف نتواصل معك؟', help: 'للعروض الجديدة والمدفوعات وكل ما يحتاجك.', options: { telegram: { label: 'Telegram', note: 'وكيلك يعمل لك هناك أيضًا' }, email: { label: 'البريد الإلكتروني', note: 'رسالة قصيرة عند الحاجة إليك' }, both: { label: 'كلاهما', note: 'Telegram أولًا، والبريد احتياطًا' } } },
    },
    reading: { title: 'قراءة إجاباتك', body: 'إعداد وكلائك وصفحتك الرئيسية.' },
    summary: { title: 'هذا Karwan الخاص بك', body: 'راجعه. لا يُحفظ شيء حتى تقول إنه صحيح.', looksRight: 'يبدو صحيحًا', change: 'غيّر شيئًا' },
    buttons: { back: 'رجوع', skip: 'تخطٍّ', next: 'التالي' },
    saveError: 'لم يُحفظ ذلك. حاول بعد لحظة.',
    start: 'إعداد Karwan الخاص بي', meChange: 'غيّر طريقة عمل وكلائك',
    quick: {
      roleTitle: 'ما الذي يأتي بك إلى Karwan؟',
      roles: { sell: { label: 'أبيع', note: 'عملك أو بضاعتك' }, buy: { label: 'أشتري أو أوظّف', note: 'اعثر على شخص وادفع بأمان' }, both: { label: 'الاثنان', note: 'أبيع وأشتري' } },
      sellLabel: 'ما تبيعه وسعرك المعتاد',
      sellExample: 'تصميم شعار، من 20 إلى 40 USDC، 3 أيام',
      sellExamples: ['تصميم شعار، من 20 إلى 40 USDC، 3 أيام', 'تصليح هواتف، حوالي 10 USDC، في نفس اليوم', 'قماش أنقرة، 15 USDC للقطعة'],
      buyLabel: 'ما تحتاجه وميزانيتك',
      buyExample: 'مصمم لعلامتي التجارية، حتى 50 USDC',
      buyExamples: ['مصمم، حتى 50 USDC', 'تصليح هاتف، حتى 20 USDC', 'أرز من مورد'],
      readAs: 'فهم وكيلك',
      reading: 'جارٍ القراءة…',
      lowest: '{money} الأدنى',
      usual: '{money} المعتاد',
      days: '{n} أيام',
      sameDay: 'في نفس اليوم',
      range: '{min} إلى {max}',
      noPrice: 'لا يوجد سعر بعد. أضف سعرًا، أو تابع وسأسألك قبل أي صفقة.',
      amanRole: 'أستخدم هذا لأجد لك أشخاصًا في السوق.',
      amanSell: 'أعرض عملك بهذا السعر. يمكنك تغييره في أي وقت.',
      amanBuy: 'أبحث عمّن يبيع هذا وأعرضهم عليك قبل أي اتفاق.',
      amanBoth: 'أبحث عن مشترين لما تبيعه وبائعين لما تحتاجه.',
      whereTitle: 'أين أنت، وكيف نتواصل معك؟',
      country: 'البلد',
      city: 'المدينة',
      cityPlaceholder: 'مدينتك أو بلدتك',
      useLocation: 'استخدم موقعي',
      kept: 'يبقى خاصًا',
      finding: 'جارٍ تحديد موقعك…',
      notFound: 'لم نجد موقعك. اختر مدينتك بدلًا من ذلك.',
      keepTyped: 'استخدم {city}',
      nearbySell: 'أشخاص في {city} يطلبون {what}',
      nearbyBuy: 'أشخاص في {city} يبيعون {what}',
      reachTitle: 'كيف نتواصل معك',
      telegramNote: 'وكيلك يعمل هناك أيضًا',
      emailNote: 'رسالة قصيرة عندما نحتاجك',
      amanWhere: 'يظهر بلدك فقط. مدينتك تساعدني على إيجاد أشخاص قريبين منك.',
      summarySub: 'هذا ما سيراه الناس في السوق.',
      offer: 'عرض',
      request: 'طلب',
      newOn: 'جديد على Karwan',
      delivers: 'التسليم خلال {days}',
      upTo: 'حتى {money}',
      postNow: 'انشره في السوق الآن',
      rows: { tag: 'المعرّف', where: 'أين', reach: 'نتواصل معك عبر', agent: 'وكيلك' },
      reachBoth: 'Telegram والبريد الإلكتروني',
      agentOffers: 'يقدّم العروض',
      agentAsks: 'يسألك أولًا',
      held: 'عندما تتفق على صفقة، يُحتجز مال المشتري حتى يُعتمد العمل، ثم يذهب إلى البائع.',
      done: 'يبدو صحيحًا، إلى الرئيسية',
      saving: 'جارٍ الحفظ…',
      change: 'تغيير',
    },
    reachSetting: 'كيف نتواصل معك',
  },
  hi: {
    later: 'मैं यह बाद में करूँगा',
    progressLabel: 'आपका Karwan सेट हो रहा है',
    progress: '{total} में से {index}',
    choices: {
      reach: { title: 'हम आप तक कैसे पहुँचें?', help: 'नए ऑफ़र, भुगतान और जिस भी चीज़ में आपकी ज़रूरत हो।', options: { telegram: { label: 'Telegram', note: 'आपका एजेंट वहाँ भी आपके लिए काम करता है' }, email: { label: 'ईमेल', note: 'ज़रूरत पड़ने पर एक छोटा संदेश' }, both: { label: 'दोनों', note: 'पहले Telegram, ईमेल बैकअप के रूप में' } } },
    },
    reading: { title: 'आपके जवाब पढ़ रहा हूँ', body: 'आपके एजेंट और होम सेट कर रहा हूँ।' },
    summary: { title: 'यह रहा आपका Karwan', body: 'जाँच लें। जब तक आप सही न कहें, कुछ भी सेव नहीं होता।', looksRight: 'सही है', change: 'कुछ बदलें' },
    buttons: { back: 'वापस', skip: 'छोड़ें', next: 'आगे' },
    saveError: 'सेव नहीं हुआ। थोड़ी देर में फिर कोशिश करें।',
    start: 'मेरा Karwan सेट करें', meChange: 'अपने एजेंटों के काम का तरीका बदलें',
    quick: {
      roleTitle: 'आप Karwan पर किसलिए आए हैं?',
      roles: { sell: { label: 'बेचना', note: 'आपका काम या आपका सामान' }, buy: { label: 'खरीदना या काम पर रखना', note: 'किसी को खोजें और सुरक्षित भुगतान करें' }, both: { label: 'दोनों', note: 'बेचना और खरीदना' } },
      sellLabel: 'आप क्या बेचते हैं और आपकी सामान्य कीमत',
      sellExample: 'लोगो डिज़ाइन, 20 से 40 USDC, 3 दिन',
      sellExamples: ['लोगो डिज़ाइन, 20 से 40 USDC, 3 दिन', 'फ़ोन मरम्मत, लगभग 10 USDC, उसी दिन', 'अंकारा कपड़ा, 15 USDC प्रति पीस'],
      buyLabel: 'आपको क्या चाहिए और आपका बजट',
      buyExample: 'मेरे ब्रांड के लिए डिज़ाइनर, 50 USDC तक',
      buyExamples: ['डिज़ाइनर, 50 USDC तक', 'फ़ोन मरम्मत, 20 USDC तक', 'सप्लायर से चावल'],
      readAs: 'आपके एजेंट ने यह समझा',
      reading: 'पढ़ रहे हैं…',
      lowest: '{money} न्यूनतम',
      usual: '{money} सामान्य',
      days: '{n} दिन',
      sameDay: 'उसी दिन',
      range: '{min} से {max}',
      noPrice: 'अभी कोई कीमत नहीं। एक जोड़ें, या आगे बढ़ें और मैं किसी भी सौदे से पहले पूछूंगा।',
      amanRole: 'मैं इससे मार्केट में आपके लिए लोग ढूंढता हूं।',
      amanSell: 'मैं आपका काम इस कीमत पर पेश करता हूं। आप इसे कभी भी बदल सकते हैं।',
      amanBuy: 'मैं इसे बेचने वालों को ढूंढता हूं और कुछ तय होने से पहले आपको दिखाता हूं।',
      amanBoth: 'मैं आपकी बिक्री के लिए खरीदार और आपकी ज़रूरत के लिए विक्रेता ढूंढता हूं।',
      whereTitle: 'आप कहां हैं, और हम आपसे कैसे संपर्क करें?',
      country: 'देश',
      city: 'शहर',
      cityPlaceholder: 'आपका शहर या कस्बा',
      useLocation: 'मेरी लोकेशन इस्तेमाल करें',
      kept: 'निजी रहती है',
      finding: 'आपको ढूंढ रहे हैं…',
      notFound: 'आपकी लोकेशन नहीं मिली। अपना शहर चुनें।',
      keepTyped: '{city} इस्तेमाल करें',
      nearbySell: 'लोग {city} में {what} मांग रहे हैं',
      nearbyBuy: 'लोग {city} में {what} बेचते हैं',
      reachTitle: 'हम आपसे कैसे संपर्क करें',
      telegramNote: 'आपका एजेंट वहां भी काम करता है',
      emailNote: 'जब आपकी ज़रूरत हो तब एक छोटा संदेश',
      amanWhere: 'सिर्फ़ आपका देश दिखता है। आपका शहर मुझे आपके पास के लोग ढूंढने में मदद करता है।',
      summarySub: 'मार्केट में लोग यही देखेंगे।',
      offer: 'ऑफ़र',
      request: 'अनुरोध',
      newOn: 'Karwan पर नया',
      delivers: '{days} में डिलीवरी',
      upTo: '{money} तक',
      postNow: 'इसे अभी मार्केट में पोस्ट करें',
      rows: { tag: 'टैग', where: 'कहां', reach: 'संपर्क का तरीका', agent: 'आपका एजेंट' },
      reachBoth: 'Telegram और ईमेल',
      agentOffers: 'ऑफ़र देता है',
      agentAsks: 'पहले आपसे पूछता है',
      held: 'जब आप सौदा तय करते हैं, खरीदार का पैसा काम मंज़ूर होने तक रोका जाता है, फिर विक्रेता को जाता है।',
      done: 'सही है, होम पर चलें',
      saving: 'सेव हो रहा है…',
      change: 'बदलें',
    },
    reachSetting: 'हम आपसे कैसे संपर्क करें',
  },
  sw: {
    later: 'Nitafanya hivi baadaye',
    progressLabel: 'Kuweka Karwan yako',
    progress: '{index} kati ya {total}',
    choices: {
      reach: { title: 'Tukufikie vipi?', help: 'Kwa ofa mpya, malipo na chochote kinachokuhitaji.', options: { telegram: { label: 'Telegram', note: 'Wakala wako anakufanyia kazi huko pia' }, email: { label: 'Barua pepe', note: 'Ujumbe mfupi kitu kinapokuhitaji' }, both: { label: 'Vyote viwili', note: 'Telegram kwanza, barua pepe kama akiba' } } },
    },
    reading: { title: 'Ninasoma majibu yako', body: 'Ninaweka mawakala wako na Mwanzo wako.' },
    summary: { title: 'Hii ndiyo Karwan yako', body: 'Iangalie. Hakuna kinachohifadhiwa hadi useme iko sawa.', looksRight: 'Iko sawa', change: 'Badilisha kitu' },
    buttons: { back: 'Rudi', skip: 'Ruka', next: 'Endelea' },
    saveError: 'Haikuhifadhiwa. Jaribu tena baada ya muda mfupi.',
    start: 'Weka Karwan yangu', meChange: 'Badilisha jinsi mawakala wako wanavyofanya kazi',
    quick: {
      roleTitle: 'Nini kinakuleta Karwan?',
      roles: { sell: { label: 'Kuuza', note: 'Kazi yako au bidhaa zako' }, buy: { label: 'Kununua au kuajiri', note: 'Pata mtu na ulipe kwa usalama' }, both: { label: 'Vyote viwili', note: 'Kuuza na kununua' } },
      sellLabel: 'Unachouza na bei yako ya kawaida',
      sellExample: 'Kubuni nembo, USDC 20 hadi 40, siku 3',
      sellExamples: ['Kubuni nembo, USDC 20 hadi 40, siku 3', 'Kutengeneza simu, karibu USDC 10, siku hiyo hiyo', 'Kitambaa cha ankara, USDC 15 kwa kipande'],
      buyLabel: 'Unachohitaji na bajeti yako',
      buyExample: 'Mbunifu wa chapa yangu, hadi USDC 50',
      buyExamples: ['Mbunifu, hadi USDC 50', 'Kutengeneza simu, hadi USDC 20', 'Mchele kutoka kwa msambazaji'],
      readAs: 'Wakala wako ameelewa',
      reading: 'Inasoma…',
      lowest: '{money} chini kabisa',
      usual: '{money} kawaida',
      days: 'siku {n}',
      sameDay: 'Siku hiyo hiyo',
      range: '{min} hadi {max}',
      noPrice: 'Bado hakuna bei. Ongeza moja, au endelea nami nitakuuliza kabla ya makubaliano yoyote.',
      amanRole: 'Natumia hii kukutafutia watu sokoni.',
      amanSell: 'Natoa kazi yako kwa bei hii. Unaweza kuibadilisha wakati wowote.',
      amanBuy: 'Natafuta wanaouza hiki na nakuonyesha kabla ya kukubaliana chochote.',
      amanBoth: 'Natafuta wanunuzi wa unachouza na wauzaji wa unachohitaji.',
      whereTitle: 'Uko wapi, na tukufikie vipi?',
      country: 'Nchi',
      city: 'Mji',
      cityPlaceholder: 'Mji wako',
      useLocation: 'Tumia mahali nilipo',
      kept: 'Inabaki siri',
      finding: 'Inakutafuta…',
      notFound: 'Hatukukupata. Chagua mji wako badala yake.',
      keepTyped: 'Tumia {city}',
      nearbySell: 'watu wa {city} wanaomba {what}',
      nearbyBuy: 'watu wa {city} wanauza {what}',
      reachTitle: 'Tukufikie vipi',
      telegramNote: 'Wakala wako anafanya kazi huko pia',
      emailNote: 'Ujumbe mfupi unapohitajika',
      amanWhere: 'Nchi yako tu ndiyo huonyeshwa. Mji wako hunisaidia kupata watu karibu nawe.',
      summarySub: 'Hiki ndicho watu wataona sokoni.',
      offer: 'Ofa',
      request: 'Ombi',
      newOn: 'mpya Karwan',
      delivers: 'Inawasilishwa ndani ya {days}',
      upTo: 'Hadi {money}',
      postNow: 'Ichapishe sokoni sasa',
      rows: { tag: 'Lebo', where: 'Wapi', reach: 'Tunakufikia kwa', agent: 'Wakala wako' },
      reachBoth: 'Telegram na barua pepe',
      agentOffers: 'Hutoa ofa',
      agentAsks: 'Hukuuliza kwanza',
      held: 'Mnapokubaliana, pesa ya mnunuzi hushikiliwa hadi kazi iidhinishwe, kisha huenda kwa muuzaji.',
      done: 'Iko sawa, nipeleke nyumbani',
      saving: 'Inahifadhi…',
      change: 'Badilisha',
    },
    reachSetting: 'Jinsi tunavyokufikia',
  },
};
