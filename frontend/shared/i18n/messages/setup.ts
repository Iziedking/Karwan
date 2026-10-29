/// The setup conversation after activation (view 19).
type Option = { label: string; note: string };
type Question = { title: string; help: string; example: string; examples: string[] };

export interface SetupCopy {
  later: string;
  progressLabel: string;
  progress: string;
  welcome: { title: string; body: string; start: string };
  goals: { title: string; help: string; options: Record<'work' | 'sell' | 'buy' | 'business' | 'record', Option> };
  questions: {
    what: Question & { titleSell: string; exampleSell: string; examplesSell: string[] };
    price: Question;
    buy: Question;
    business: Question;
    places: Question;
    where: Question;
  };
  priceAgain: string;
  choices: {
    paid: { title: string; help: string; options: Record<'one_time' | 'milestones' | 'goods', Option> };
    clients: { title: string; help: string; options: Record<'own' | 'find' | 'both', Option> };
    own: { title: string; help: string; options: Record<'offers' | 'ask', Option> };
    reach: { title: string; help: string; options: Record<'telegram' | 'email' | 'both', Option> };
  };
  ask: string;
  reading: { title: string; body: string };
  summary: { title: string; body: string; looksRight: string; change: string };
  post: { offer: string; request: string; body: string; postIt: string; notNow: string };
  buttons: { back: string; skip: string; next: string };
  saveError: string;
  /// The button after activation, and the row under Me.
  start: string;
  meChange: string;
  /// The Settings row for the reach answer.
  reachSetting: string;
}

export const setupCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', SetupCopy> = {
  en: {
    later: "I'll do this later",
    progressLabel: 'Setting up your Karwan',
    progress: '{index} of {total}',
    welcome: { title: "Let's set up Karwan for you", body: "I'm your Karwan agent. Answer a few quick questions and I'll set up Karwan the way you want to use it. About a minute.", start: "Let's go" },
    goals: {
      title: 'What do you want Karwan to do for you?',
      help: 'Pick all that fit. You can change this any time.',
      options: {
        work: { label: 'Get paid safely for my work', note: 'Freelancers and services' },
        sell: { label: 'Sell my products', note: 'Goods, online or in person' },
        buy: { label: 'Buy or hire', note: 'Find someone and pay safely' },
        business: { label: 'Run my business deals', note: 'Orders with other businesses' },
        record: { label: 'Build a record clients trust', note: 'One name across the places you work' },
      },
    },
    questions: {
      what: { title: 'What do you do?', titleSell: 'What do you sell?', help: 'One line in your own words. Your agent uses it to find clients.', example: 'Logo and brand design', examples: ['Logo and brand design', 'Phone repairs', 'Website building'], exampleSell: 'Ankara fabric, 6 yards a piece', examplesSell: ['Ankara fabric', 'Bags of rice', 'Shea butter'] },
      price: { title: 'Your usual price and how fast you deliver', help: 'However you say it. Your agent turns it into a price range.', example: '20 to 40 USDC, 3 days', examples: ['20 to 40 USDC, 3 days', 'About 100 USDC, a week', 'Up to 50 USDC, same day'] },
      buy: { title: 'What do you usually buy or hire for?', help: 'And your usual budget, if you have one.', example: 'Phone repairs, up to 50 USDC', examples: ['Phone repairs, up to 50 USDC', 'Fabric from suppliers', 'A designer for my brand'] },
      business: { title: 'Your business name, and what it trades', help: 'We start your business profile with this.', example: 'Bello Foods, rice and grains to shops', examples: ['Bello Foods, rice and grains', 'Ada Studio, design'] },
      places: { title: 'Where do you already work or sell?', help: 'You can connect these later. Only accounts you prove are yours count toward your record.', example: 'Instagram, WhatsApp, Fiverr', examples: ['Instagram', 'WhatsApp', 'Fiverr', 'Jumia'] },
      where: { title: 'Where are you?', help: 'Only your country is ever shown. Your city helps find people near you.', example: 'Lagos, Nigeria', examples: ['Lagos, Nigeria', 'Accra, Ghana', 'Nairobi, Kenya'] },
    },
    priceAgain: "I couldn't read a price there. What do you usually charge, in USDC? For example: 20 to 40 USDC.",
    choices: {
      paid: { title: 'How do clients usually pay you?', help: 'Your agent offers deals this way. Add other ways later on your profile.', options: { one_time: { label: 'All at once', note: 'Paid when the work is done' }, milestones: { label: 'In stages', note: 'A part is paid as each stage is approved' }, goods: { label: 'I send goods', note: 'Paid when the buyer has the item' } } },
      clients: { title: 'Do you have clients already, or should Karwan find them?', help: 'This decides what Home puts first for you.', options: { own: { label: 'I have clients', note: 'Send them payment requests and protected deals' }, find: { label: 'Find clients for me', note: 'Your agent looks for matching requests' }, both: { label: 'Both', note: 'Your own clients, and new ones from the market' } } },
      own: { title: 'How much should your agent do on its own?', help: 'Money never moves without your confirmation.', options: { offers: { label: 'Make offers within my price', note: 'It offers for you, then asks before any deal' }, ask: { label: 'Ask me first', note: 'It suggests, you decide every time' } } },
      reach: { title: 'How should we reach you?', help: 'For new offers, payments and anything that needs you.', options: { telegram: { label: 'Telegram', note: 'Your agent works for you there too' }, email: { label: 'Email', note: 'A short note when something needs you' }, both: { label: 'Both', note: 'Telegram first, email as backup' } } },
    },
    ask: 'Got a question? Ask me',
    reading: { title: 'Reading your answers', body: 'Setting up your agents and your Home.' },
    summary: { title: "Here's your Karwan", body: 'Check it. Nothing is saved until you say it looks right.', looksRight: 'Looks right', change: 'Change something' },
    post: { offer: 'Post this as your first offer?', request: 'Post this as your first request?', body: 'Your agent shows it to you first. Nothing is posted until you confirm.', postIt: 'Post it', notNow: 'Not now' },
    buttons: { back: 'Back', skip: 'Skip', next: 'Next' },
    saveError: "That didn't save. Try again in a moment.",
    start: 'Set up my Karwan', meChange: 'Change how your agents work',
    reachSetting: 'How we reach you',
  },
  fr: {
    later: 'Je le ferai plus tard',
    progressLabel: 'Configuration de votre Karwan',
    progress: '{index} sur {total}',
    welcome: { title: "Configurons Karwan pour vous", body: 'Je suis votre agent Karwan. Répondez à quelques questions et je configure Karwan comme vous voulez l’utiliser. Environ une minute.', start: 'C’est parti' },
    goals: {
      title: 'Que voulez-vous que Karwan fasse pour vous ?',
      help: 'Choisissez tout ce qui vous correspond. Vous pourrez changer à tout moment.',
      options: {
        work: { label: 'Être payé en sécurité pour mon travail', note: 'Indépendants et services' },
        sell: { label: 'Vendre mes produits', note: 'Biens, en ligne ou en personne' },
        buy: { label: 'Acheter ou embaucher', note: 'Trouver quelqu’un et payer en sécurité' },
        business: { label: 'Gérer les accords de mon entreprise', note: 'Commandes avec d’autres entreprises' },
        record: { label: 'Bâtir un historique de confiance', note: 'Un seul nom partout où vous travaillez' },
      },
    },
    questions: {
      what: { title: 'Que faites-vous ?', titleSell: 'Que vendez-vous ?', help: 'Une ligne, avec vos mots. Votre agent s’en sert pour trouver des clients.', example: 'Création de logo et d’identité', examples: ['Création de logo', 'Réparation de téléphones', 'Création de sites web'], exampleSell: 'Tissu ankara, 6 yards la pièce', examplesSell: ['Tissu ankara', 'Sacs de riz', 'Beurre de karité'] },
      price: { title: 'Votre prix habituel et votre délai', help: 'Comme vous le dites. Votre agent en fait une fourchette de prix.', example: '20 à 40 USDC, 3 jours', examples: ['20 à 40 USDC, 3 jours', 'Environ 100 USDC, une semaine', 'Jusqu’à 50 USDC, le jour même'] },
      buy: { title: 'Qu’achetez-vous ou pour quoi embauchez-vous d’habitude ?', help: 'Et votre budget habituel, si vous en avez un.', example: 'Réparation de téléphones, jusqu’à 50 USDC', examples: ['Réparation de téléphones, jusqu’à 50 USDC', 'Tissu auprès de fournisseurs', 'Un designer pour ma marque'] },
      business: { title: 'Le nom de votre entreprise et ce qu’elle vend', help: 'Nous commençons votre profil d’entreprise avec ceci.', example: 'Bello Foods, riz et céréales pour boutiques', examples: ['Bello Foods, riz et céréales', 'Ada Studio, design'] },
      places: { title: 'Où travaillez-vous ou vendez-vous déjà ?', help: 'Vous pourrez les connecter plus tard. Seuls les comptes dont vous prouvez la propriété comptent.', example: 'Instagram, WhatsApp, Fiverr', examples: ['Instagram', 'WhatsApp', 'Fiverr', 'Jumia'] },
      where: { title: 'Où êtes-vous ?', help: 'Seul votre pays est affiché. Votre ville aide à trouver des gens près de vous.', example: 'Lagos, Nigeria', examples: ['Lagos, Nigeria', 'Accra, Ghana', 'Nairobi, Kenya'] },
    },
    priceAgain: 'Je n’ai pas pu lire un prix. Combien demandez-vous d’habitude, en USDC ? Par exemple : 20 à 40 USDC.',
    choices: {
      paid: { title: 'Comment vos clients vous paient-ils d’habitude ?', help: 'Votre agent propose des accords de cette façon. Ajoutez-en d’autres plus tard sur votre profil.', options: { one_time: { label: 'En une fois', note: 'Payé quand le travail est fait' }, milestones: { label: 'Par étapes', note: 'Une part est payée à chaque étape approuvée' }, goods: { label: 'J’envoie des marchandises', note: 'Payé quand l’acheteur a l’article' } } },
      clients: { title: 'Avez-vous déjà des clients, ou Karwan doit-il en trouver ?', help: 'Cela décide de ce que l’accueil met en premier.', options: { own: { label: 'J’ai des clients', note: 'Envoyez-leur des demandes de paiement et des accords protégés' }, find: { label: 'Trouvez-moi des clients', note: 'Votre agent cherche des demandes qui vous correspondent' }, both: { label: 'Les deux', note: 'Vos clients, et de nouveaux venus du marché' } } },
      own: { title: 'Que doit faire votre agent seul ?', help: 'L’argent ne bouge jamais sans votre confirmation.', options: { offers: { label: 'Faire des offres dans mon prix', note: 'Il propose pour vous, puis demande avant tout accord' }, ask: { label: 'Me demander d’abord', note: 'Il suggère, vous décidez à chaque fois' } } },
      reach: { title: 'Comment vous joindre ?', help: 'Pour les nouvelles offres, les paiements et tout ce qui a besoin de vous.', options: { telegram: { label: 'Telegram', note: 'Votre agent y travaille aussi pour vous' }, email: { label: 'E-mail', note: 'Un petit mot quand quelque chose a besoin de vous' }, both: { label: 'Les deux', note: 'Telegram d’abord, l’e-mail en secours' } } },
    },
    ask: 'Une question ? Demandez-moi',
    reading: { title: 'Lecture de vos réponses', body: 'Configuration de vos agents et de votre accueil.' },
    summary: { title: 'Voici votre Karwan', body: 'Vérifiez. Rien n’est enregistré avant que vous disiez que c’est bon.', looksRight: 'C’est bon', change: 'Changer quelque chose' },
    post: { offer: 'Publier ceci comme votre première offre ?', request: 'Publier ceci comme votre première demande ?', body: 'Votre agent vous la montre d’abord. Rien n’est publié avant votre confirmation.', postIt: 'Publier', notNow: 'Pas maintenant' },
    buttons: { back: 'Retour', skip: 'Passer', next: 'Suivant' },
    saveError: 'L’enregistrement a échoué. Réessayez dans un instant.',
    start: 'Configurer mon Karwan', meChange: 'Changer le travail de vos agents',
    reachSetting: 'Comment vous joindre',
  },
  ar: {
    later: 'سأفعل هذا لاحقًا',
    progressLabel: 'إعداد Karwan الخاص بك',
    progress: '{index} من {total}',
    welcome: { title: "لنُعِدّ Karwan لك", body: 'أنا وكيلك في Karwan. أجب عن بضعة أسئلة سريعة وسأعدّ Karwan بالطريقة التي تريد استخدامه بها. نحو دقيقة واحدة.', start: 'لنبدأ' },
    goals: {
      title: 'ماذا تريد أن يفعل Karwan لك؟',
      help: 'اختر كل ما يناسبك. يمكنك التغيير في أي وقت.',
      options: {
        work: { label: 'أن أتقاضى أجر عملي بأمان', note: 'المستقلون والخدمات' },
        sell: { label: 'بيع منتجاتي', note: 'سلع عبر الإنترنت أو وجهًا لوجه' },
        buy: { label: 'الشراء أو التوظيف', note: 'جد شخصًا وادفع بأمان' },
        business: { label: 'إدارة صفقات عملي', note: 'طلبات مع شركات أخرى' },
        record: { label: 'بناء سجل يثق به العملاء', note: 'اسم واحد في كل مكان تعمل فيه' },
      },
    },
    questions: {
      what: { title: 'ماذا تعمل؟', titleSell: 'ماذا تبيع؟', help: 'سطر واحد بكلماتك. يستخدمه وكيلك لإيجاد عملاء.', example: 'تصميم الشعارات والهوية', examples: ['تصميم الشعارات', 'إصلاح الهواتف', 'بناء المواقع'], exampleSell: 'قماش أنقرة، 6 ياردات للقطعة', examplesSell: ['قماش أنقرة', 'أكياس أرز', 'زبدة الشيا'] },
      price: { title: 'سعرك المعتاد ومدة التسليم', help: 'كما تقولها. وكيلك يحوّلها إلى نطاق سعر.', example: '20 إلى 40 USDC، 3 أيام', examples: ['20 إلى 40 USDC، 3 أيام', 'نحو 100 USDC، أسبوع', 'حتى 50 USDC، في اليوم نفسه'] },
      buy: { title: 'ماذا تشتري أو توظّف عادةً؟', help: 'وميزانيتك المعتادة إن وُجدت.', example: 'إصلاح الهواتف، حتى 50 USDC', examples: ['إصلاح الهواتف، حتى 50 USDC', 'قماش من الموردين', 'مصمم لعلامتي'] },
      business: { title: 'اسم عملك وما يتاجر به', help: 'نبدأ ملف عملك بهذا.', example: 'Bello Foods، أرز وحبوب للمتاجر', examples: ['Bello Foods، أرز وحبوب', 'Ada Studio، تصميم'] },
      places: { title: 'أين تعمل أو تبيع حاليًا؟', help: 'يمكنك ربطها لاحقًا. لا يُحتسب في سجلك إلا ما تثبت أنه لك.', example: 'Instagram، WhatsApp، Fiverr', examples: ['Instagram', 'WhatsApp', 'Fiverr', 'Jumia'] },
      where: { title: 'أين أنت؟', help: 'لا يظهر إلا بلدك. مدينتك تساعد على إيجاد أشخاص قريبين.', example: 'لاغوس، نيجيريا', examples: ['لاغوس، نيجيريا', 'أكرا، غانا', 'نيروبي، كينيا'] },
    },
    priceAgain: 'لم أستطع قراءة سعر. كم تتقاضى عادةً بعملة USDC؟ مثلًا: 20 إلى 40 USDC.',
    choices: {
      paid: { title: 'كيف يدفع لك عملاؤك عادةً؟', help: 'وكيلك يعرض الصفقات بهذه الطريقة. أضف طرقًا أخرى لاحقًا من ملفك.', options: { one_time: { label: 'دفعة واحدة', note: 'يُدفع عند إنجاز العمل' }, milestones: { label: 'على مراحل', note: 'يُدفع جزء مع اعتماد كل مرحلة' }, goods: { label: 'أرسل بضائع', note: 'يُدفع حين يستلم المشتري السلعة' } } },
      clients: { title: 'هل لديك عملاء، أم يجدهم Karwan لك؟', help: 'هذا يحدد ما تضعه الصفحة الرئيسية أولًا.', options: { own: { label: 'لدي عملاء', note: 'أرسل لهم طلبات دفع وصفقات محمية' }, find: { label: 'جد لي عملاء', note: 'وكيلك يبحث عن طلبات تناسبك' }, both: { label: 'كلاهما', note: 'عملاؤك، وعملاء جدد من السوق' } } },
      own: { title: 'ما الذي يفعله وكيلك وحده؟', help: 'لا يتحرك المال أبدًا دون تأكيدك.', options: { offers: { label: 'يقدّم عروضًا ضمن سعري', note: 'يعرض نيابة عنك، ثم يسألك قبل أي صفقة' }, ask: { label: 'اسألني أولًا', note: 'يقترح، وأنت تقرر كل مرة' } } },
      reach: { title: 'كيف نتواصل معك؟', help: 'للعروض الجديدة والمدفوعات وكل ما يحتاجك.', options: { telegram: { label: 'Telegram', note: 'وكيلك يعمل لك هناك أيضًا' }, email: { label: 'البريد الإلكتروني', note: 'رسالة قصيرة عند الحاجة إليك' }, both: { label: 'كلاهما', note: 'Telegram أولًا، والبريد احتياطًا' } } },
    },
    ask: 'لديك سؤال؟ اسألني',
    reading: { title: 'قراءة إجاباتك', body: 'إعداد وكلائك وصفحتك الرئيسية.' },
    summary: { title: 'هذا Karwan الخاص بك', body: 'راجعه. لا يُحفظ شيء حتى تقول إنه صحيح.', looksRight: 'يبدو صحيحًا', change: 'غيّر شيئًا' },
    post: { offer: 'هل تنشر هذا كأول عرض لك؟', request: 'هل تنشر هذا كأول طلب لك؟', body: 'يعرضه وكيلك عليك أولًا. لا يُنشر شيء حتى تؤكد.', postIt: 'انشره', notNow: 'ليس الآن' },
    buttons: { back: 'رجوع', skip: 'تخطٍّ', next: 'التالي' },
    saveError: 'لم يُحفظ ذلك. حاول بعد لحظة.',
    start: 'إعداد Karwan الخاص بي', meChange: 'غيّر طريقة عمل وكلائك',
    reachSetting: 'كيف نتواصل معك',
  },
  hi: {
    later: 'मैं यह बाद में करूँगा',
    progressLabel: 'आपका Karwan सेट हो रहा है',
    progress: '{total} में से {index}',
    welcome: { title: "चलिए Karwan आपके लिए सेट करें", body: 'मैं आपका Karwan एजेंट हूँ। कुछ छोटे सवालों के जवाब दें और मैं Karwan को आपके इस्तेमाल के तरीके से सेट कर दूँगा। लगभग एक मिनट।', start: 'शुरू करें' },
    goals: {
      title: 'आप Karwan से क्या करवाना चाहते हैं?',
      help: 'जो भी लागू हो, सब चुनें। आप कभी भी बदल सकते हैं।',
      options: {
        work: { label: 'अपने काम का सुरक्षित भुगतान', note: 'फ़्रीलांसर और सेवाएँ' },
        sell: { label: 'अपने उत्पाद बेचना', note: 'सामान, ऑनलाइन या आमने-सामने' },
        buy: { label: 'खरीदना या काम पर रखना', note: 'किसी को ढूँढें और सुरक्षित भुगतान करें' },
        business: { label: 'अपने व्यवसाय के सौदे चलाना', note: 'दूसरे व्यवसायों के साथ ऑर्डर' },
        record: { label: 'भरोसेमंद रिकॉर्ड बनाना', note: 'हर जगह जहाँ आप काम करते हैं, एक नाम' },
      },
    },
    questions: {
      what: { title: 'आप क्या करते हैं?', titleSell: 'आप क्या बेचते हैं?', help: 'अपने शब्दों में एक पंक्ति। आपका एजेंट इससे ग्राहक ढूँढता है।', example: 'लोगो और ब्रांड डिज़ाइन', examples: ['लोगो डिज़ाइन', 'फ़ोन रिपेयर', 'वेबसाइट बनाना'], exampleSell: 'अंकारा कपड़ा, 6 गज प्रति पीस', examplesSell: ['अंकारा कपड़ा', 'चावल की बोरियाँ', 'शिया बटर'] },
      price: { title: 'आपकी सामान्य कीमत और डिलीवरी का समय', help: 'जैसे भी आप कहें। आपका एजेंट इसे कीमत की सीमा में बदल देता है।', example: '20 से 40 USDC, 3 दिन', examples: ['20 से 40 USDC, 3 दिन', 'लगभग 100 USDC, एक हफ़्ता', '50 USDC तक, उसी दिन'] },
      buy: { title: 'आप आमतौर पर क्या खरीदते हैं या किसके लिए काम पर रखते हैं?', help: 'और आपका सामान्य बजट, अगर हो।', example: 'फ़ोन रिपेयर, 50 USDC तक', examples: ['फ़ोन रिपेयर, 50 USDC तक', 'सप्लायर से कपड़ा', 'मेरे ब्रांड के लिए डिज़ाइनर'] },
      business: { title: 'आपके व्यवसाय का नाम, और वह क्या बेचता है', help: 'हम इससे आपकी व्यवसाय प्रोफ़ाइल शुरू करते हैं।', example: 'Bello Foods, दुकानों को चावल और अनाज', examples: ['Bello Foods, चावल और अनाज', 'Ada Studio, डिज़ाइन'] },
      places: { title: 'आप अभी कहाँ काम करते या बेचते हैं?', help: 'आप इन्हें बाद में जोड़ सकते हैं। सिर्फ़ वही खाते गिने जाते हैं जो आप अपने साबित करें।', example: 'Instagram, WhatsApp, Fiverr', examples: ['Instagram', 'WhatsApp', 'Fiverr', 'Jumia'] },
      where: { title: 'आप कहाँ हैं?', help: 'सिर्फ़ आपका देश दिखता है। आपका शहर पास के लोगों को ढूँढने में मदद करता है।', example: 'लागोस, नाइजीरिया', examples: ['लागोस, नाइजीरिया', 'अक्रा, घाना', 'नैरोबी, केन्या'] },
    },
    priceAgain: 'मैं वहाँ कीमत नहीं पढ़ पाया। आप आमतौर पर USDC में कितना लेते हैं? उदाहरण: 20 से 40 USDC।',
    choices: {
      paid: { title: 'ग्राहक आपको आमतौर पर कैसे भुगतान करते हैं?', help: 'आपका एजेंट इसी तरह डील पेश करता है। बाकी तरीके बाद में अपनी प्रोफ़ाइल पर जोड़ें।', options: { one_time: { label: 'एक बार में', note: 'काम पूरा होने पर भुगतान' }, milestones: { label: 'चरणों में', note: 'हर चरण मंज़ूर होने पर एक हिस्सा' }, goods: { label: 'मैं सामान भेजता हूँ', note: 'खरीदार के पास सामान पहुँचने पर भुगतान' } } },
      clients: { title: 'क्या आपके पास पहले से ग्राहक हैं, या Karwan उन्हें ढूँढे?', help: 'इससे तय होता है कि होम पर सबसे पहले क्या दिखे।', options: { own: { label: 'मेरे पास ग्राहक हैं', note: 'उन्हें भुगतान अनुरोध और सुरक्षित सौदे भेजें' }, find: { label: 'मेरे लिए ग्राहक ढूँढें', note: 'आपका एजेंट मेल खाते अनुरोध ढूँढता है' }, both: { label: 'दोनों', note: 'आपके ग्राहक, और बाज़ार से नए' } } },
      own: { title: 'आपका एजेंट खुद कितना करे?', help: 'आपकी पुष्टि के बिना पैसा कभी नहीं हिलता।', options: { offers: { label: 'मेरी कीमत में ऑफ़र दे', note: 'यह आपके लिए ऑफ़र देता है, फिर सौदे से पहले पूछता है' }, ask: { label: 'पहले मुझसे पूछे', note: 'यह सुझाव देता है, आप हर बार तय करते हैं' } } },
      reach: { title: 'हम आप तक कैसे पहुँचें?', help: 'नए ऑफ़र, भुगतान और जिस भी चीज़ में आपकी ज़रूरत हो।', options: { telegram: { label: 'Telegram', note: 'आपका एजेंट वहाँ भी आपके लिए काम करता है' }, email: { label: 'ईमेल', note: 'ज़रूरत पड़ने पर एक छोटा संदेश' }, both: { label: 'दोनों', note: 'पहले Telegram, ईमेल बैकअप के रूप में' } } },
    },
    ask: 'कोई सवाल? मुझसे पूछें',
    reading: { title: 'आपके जवाब पढ़ रहा हूँ', body: 'आपके एजेंट और होम सेट कर रहा हूँ।' },
    summary: { title: 'यह रहा आपका Karwan', body: 'जाँच लें। जब तक आप सही न कहें, कुछ भी सेव नहीं होता।', looksRight: 'सही है', change: 'कुछ बदलें' },
    post: { offer: 'क्या इसे अपने पहले ऑफ़र के रूप में पोस्ट करें?', request: 'क्या इसे अपने पहले अनुरोध के रूप में पोस्ट करें?', body: 'आपका एजेंट पहले आपको दिखाता है। पुष्टि से पहले कुछ भी पोस्ट नहीं होता।', postIt: 'पोस्ट करें', notNow: 'अभी नहीं' },
    buttons: { back: 'वापस', skip: 'छोड़ें', next: 'आगे' },
    saveError: 'सेव नहीं हुआ। थोड़ी देर में फिर कोशिश करें।',
    start: 'मेरा Karwan सेट करें', meChange: 'अपने एजेंटों के काम का तरीका बदलें',
    reachSetting: 'हम आपसे कैसे संपर्क करें',
  },
  sw: {
    later: 'Nitafanya hivi baadaye',
    progressLabel: 'Kuweka Karwan yako',
    progress: '{index} kati ya {total}',
    welcome: { title: "Tuweke Karwan tayari kwako", body: 'Mimi ni wakala wako wa Karwan. Jibu maswali machache ya haraka nami nitaweka Karwan jinsi unavyotaka kuitumia. Takriban dakika moja.', start: 'Tuanze' },
    goals: {
      title: 'Unataka Karwan ikufanyie nini?',
      help: 'Chagua yote yanayofaa. Unaweza kubadilisha wakati wowote.',
      options: {
        work: { label: 'Kulipwa kwa usalama kwa kazi yangu', note: 'Wafanyakazi huru na huduma' },
        sell: { label: 'Kuuza bidhaa zangu', note: 'Bidhaa, mtandaoni au ana kwa ana' },
        buy: { label: 'Kununua au kuajiri', note: 'Pata mtu na ulipe kwa usalama' },
        business: { label: 'Kuendesha makubaliano ya biashara yangu', note: 'Maagizo na biashara nyingine' },
        record: { label: 'Kujenga rekodi inayoaminika', note: 'Jina moja kila unapofanya kazi' },
      },
    },
    questions: {
      what: { title: 'Unafanya nini?', titleSell: 'Unauza nini?', help: 'Mstari mmoja kwa maneno yako. Wakala wako anautumia kupata wateja.', example: 'Kubuni nembo na chapa', examples: ['Kubuni nembo', 'Kutengeneza simu', 'Kujenga tovuti'], exampleSell: 'Kitambaa cha ankara, yadi 6 kila kipande', examplesSell: ['Kitambaa cha ankara', 'Magunia ya mchele', 'Siagi ya shea'] },
      price: { title: 'Bei yako ya kawaida na muda wa kuwasilisha', help: 'Kwa namna yoyote unavyosema. Wakala wako anaigeuza kuwa kiwango cha bei.', example: 'USDC 20 hadi 40, siku 3', examples: ['USDC 20 hadi 40, siku 3', 'Takriban USDC 100, wiki moja', 'Hadi USDC 50, siku hiyo hiyo'] },
      buy: { title: 'Kwa kawaida unanunua nini au unaajiri kwa nini?', help: 'Na bajeti yako ya kawaida, ikiwa unayo.', example: 'Kutengeneza simu, hadi USDC 50', examples: ['Kutengeneza simu, hadi USDC 50', 'Kitambaa kutoka kwa wasambazaji', 'Mbunifu wa chapa yangu'] },
      business: { title: 'Jina la biashara yako, na inachouza', help: 'Tunaanza wasifu wa biashara yako kwa hili.', example: 'Bello Foods, mchele na nafaka kwa maduka', examples: ['Bello Foods, mchele na nafaka', 'Ada Studio, ubunifu'] },
      places: { title: 'Tayari unafanya kazi au kuuza wapi?', help: 'Unaweza kuviunganisha baadaye. Akaunti unazothibitisha ni zako tu ndizo zinahesabiwa.', example: 'Instagram, WhatsApp, Fiverr', examples: ['Instagram', 'WhatsApp', 'Fiverr', 'Jumia'] },
      where: { title: 'Uko wapi?', help: 'Nchi yako tu ndiyo huonyeshwa. Mji wako husaidia kupata watu walio karibu.', example: 'Lagos, Nigeria', examples: ['Lagos, Nigeria', 'Accra, Ghana', 'Nairobi, Kenya'] },
    },
    priceAgain: 'Sikuweza kusoma bei hapo. Kwa kawaida unatoza kiasi gani kwa USDC? Kwa mfano: USDC 20 hadi 40.',
    choices: {
      paid: { title: 'Wateja wako hukulipa vipi kwa kawaida?', help: 'Wakala wako anatoa makubaliano kwa njia hii. Ongeza njia nyingine baadaye kwenye wasifu wako.', options: { one_time: { label: 'Mara moja', note: 'Unalipwa kazi ikikamilika' }, milestones: { label: 'Kwa hatua', note: 'Sehemu hulipwa kila hatua ikikubaliwa' }, goods: { label: 'Natuma bidhaa', note: 'Unalipwa mnunuzi akipata bidhaa' } } },
      clients: { title: 'Una wateja tayari, au Karwan ikutafutie?', help: 'Hili linaamua kile Mwanzo kinaweka kwanza.', options: { own: { label: 'Nina wateja', note: 'Watumie maombi ya malipo na makubaliano yaliyolindwa' }, find: { label: 'Nitafutie wateja', note: 'Wakala wako anatafuta maombi yanayofaa' }, both: { label: 'Vyote viwili', note: 'Wateja wako, na wapya kutoka sokoni' } } },
      own: { title: 'Wakala wako afanye kiasi gani peke yake?', help: 'Pesa haisogei kamwe bila uthibitisho wako.', options: { offers: { label: 'Toa ofa ndani ya bei yangu', note: 'Anatoa ofa kwa niaba yako, kisha anauliza kabla ya makubaliano' }, ask: { label: 'Niulize kwanza', note: 'Anapendekeza, wewe unaamua kila mara' } } },
      reach: { title: 'Tukufikie vipi?', help: 'Kwa ofa mpya, malipo na chochote kinachokuhitaji.', options: { telegram: { label: 'Telegram', note: 'Wakala wako anakufanyia kazi huko pia' }, email: { label: 'Barua pepe', note: 'Ujumbe mfupi kitu kinapokuhitaji' }, both: { label: 'Vyote viwili', note: 'Telegram kwanza, barua pepe kama akiba' } } },
    },
    ask: 'Una swali? Niulize',
    reading: { title: 'Ninasoma majibu yako', body: 'Ninaweka mawakala wako na Mwanzo wako.' },
    summary: { title: 'Hii ndiyo Karwan yako', body: 'Iangalie. Hakuna kinachohifadhiwa hadi useme iko sawa.', looksRight: 'Iko sawa', change: 'Badilisha kitu' },
    post: { offer: 'Ichapishe kama ofa yako ya kwanza?', request: 'Ichapishe kama ombi lako la kwanza?', body: 'Wakala wako anakuonyesha kwanza. Hakuna kinachochapishwa hadi uthibitishe.', postIt: 'Ichapishe', notNow: 'Si sasa' },
    buttons: { back: 'Rudi', skip: 'Ruka', next: 'Endelea' },
    saveError: 'Haikuhifadhiwa. Jaribu tena baada ya muda mfupi.',
    start: 'Weka Karwan yangu', meChange: 'Badilisha jinsi mawakala wako wanavyofanya kazi',
    reachSetting: 'Jinsi tunavyokufikia',
  },
};
