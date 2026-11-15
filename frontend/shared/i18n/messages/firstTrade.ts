/// The first-trade checklist on Home and the money flow shown with it.
export interface FirstTradeCopy {
  title: string;
  progress: string;
  hide: string;
  steps: {
    setup: { label: string; action: string };
    money: { label: string; note: string; action: string; testnetNote: string; faucet: string; fromWallet: string };
    /// "Your assistant" is the agent, in plain words (view 57, 15 Nov).
    agentMoney: { label: string; note: string; action: string };
    agentLimits: { label: string; note: string; action: string };
    telegram: { label: string; note: string };
    deal: { label: string; buy: string; sell: string; agreement: string; paymentRequest: string };
    finish: { label: string };
  };
  flowTitle: string;
  flow: [string, string, string, string];
}

export const firstTradeCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', FirstTradeCopy> = {
  en: {
    title: 'Your first trade',
    progress: '{done} of {total}',
    hide: 'Hide',
    steps: {
      setup: { label: 'Tell your agent about your work', action: 'Tell your agent' },
      money: { label: 'Add USDC', note: 'Every deal is paid in USDC.', action: 'Add USDC', testnetNote: 'Free test USDC lets you try a whole deal.', faucet: 'Get free test USDC', fromWallet: 'Add from another wallet' },
      agentMoney: { label: 'Give your assistant money', note: 'Your assistant finds buyers and sellers and agrees prices for you. Give it money to work with.', action: 'Give it money' },
      agentLimits: { label: 'Set its limits', note: 'Your prices, and whether it asks you before a deal.', action: 'Set limits' },
      telegram: { label: 'Connect Telegram', note: 'Your agent works for you there.' },
      deal: { label: 'Start a deal', buy: 'I want to buy', sell: 'I want to sell', agreement: 'I already have a buyer or seller', paymentRequest: 'Send a client a payment request' },
      finish: { label: 'Finish it. Every deal builds your record.' },
    },
    flowTitle: 'How money moves',
    flow: ['You pay into escrow', 'They deliver', 'You release', 'Both rate'],
  },
  fr: {
    title: 'Votre premier échange',
    progress: '{done} sur {total}',
    hide: 'Masquer',
    steps: {
      setup: { label: 'Parlez de votre travail à votre agent', action: 'Parler à mon agent' },
      money: { label: 'Ajouter des USDC', note: 'Chaque accord se paie en USDC.', action: 'Ajouter des USDC', testnetNote: 'Des USDC de test gratuits pour essayer un accord complet.', faucet: 'Obtenir des USDC de test', fromWallet: 'Ajouter depuis un autre portefeuille' },
      agentMoney: { label: 'Donner de l’argent à votre assistant', note: 'Votre assistant trouve des acheteurs et des vendeurs et négocie les prix pour vous. Donnez-lui de l’argent pour travailler.', action: 'Lui donner de l’argent' },
      agentLimits: { label: 'Fixer ses limites', note: 'Vos prix, et s’il vous demande avant une affaire.', action: 'Fixer les limites' },
      telegram: { label: 'Connecter Telegram', note: 'Votre agent y travaille pour vous.' },
      deal: { label: 'Lancer un accord', buy: 'Je veux acheter', sell: 'Je veux vendre', agreement: 'J’ai déjà un acheteur ou un vendeur', paymentRequest: 'Envoyer une demande de paiement à un client' },
      finish: { label: 'Terminez-le. Chaque accord construit votre historique.' },
    },
    flowTitle: 'Comment l’argent circule',
    flow: ['Vous payez en séquestre', 'Ils livrent', 'Vous versez', 'Chacun note'],
  },
  ar: {
    title: 'صفقتك الأولى',
    progress: '{done} من {total}',
    hide: 'إخفاء',
    steps: {
      setup: { label: 'أخبر وكيلك عن عملك', action: 'أخبر وكيلك' },
      money: { label: 'أضف USDC', note: 'كل صفقة تُدفع بعملة USDC.', action: 'أضف USDC', testnetNote: 'عملات USDC تجريبية مجانية لتجربة صفقة كاملة.', faucet: 'احصل على USDC تجريبية مجانًا', fromWallet: 'أضف من محفظة أخرى' },
      agentMoney: { label: 'أعطِ مساعدك مالًا', note: 'يجد مساعدك مشترين وبائعين ويتفق على الأسعار نيابةً عنك. أعطه مالًا ليعمل به.', action: 'أعطه مالًا' },
      agentLimits: { label: 'حدّد حدوده', note: 'أسعارك، وهل يسألك قبل أي صفقة.', action: 'حدّد الحدود' },
      telegram: { label: 'اربط Telegram', note: 'وكيلك يعمل لك هناك.' },
      deal: { label: 'ابدأ صفقة', buy: 'أريد أن أشتري', sell: 'أريد أن أبيع', agreement: 'لدي مشترٍ أو بائع بالفعل', paymentRequest: 'أرسل طلب دفع إلى عميل' },
      finish: { label: 'أكملها. كل صفقة تبني سجلك.' },
    },
    flowTitle: 'كيف ينتقل المال',
    flow: ['تدفع إلى الضمان', 'يسلّمون', 'تصرف الدفعة', 'يقيّم الطرفان'],
  },
  hi: {
    title: 'आपका पहला व्यापार',
    progress: '{total} में से {done}',
    hide: 'छिपाएँ',
    steps: {
      setup: { label: 'अपने एजेंट को अपने काम के बारे में बताएँ', action: 'एजेंट को बताएँ' },
      money: { label: 'USDC जोड़ें', note: 'हर सौदे का भुगतान USDC में होता है।', action: 'USDC जोड़ें', testnetNote: 'मुफ़्त टेस्ट USDC से पूरा सौदा आज़माएँ।', faucet: 'मुफ़्त टेस्ट USDC लें', fromWallet: 'दूसरे वॉलेट से जोड़ें' },
      agentMoney: { label: 'अपने सहायक को पैसे दें', note: 'आपका सहायक आपके लिए खरीदार और विक्रेता ढूँढता है और दाम तय करता है। उसे काम के लिए पैसे दें।', action: 'पैसे दें' },
      agentLimits: { label: 'उसकी सीमा तय करें', note: 'आपके दाम, और क्या वह डील से पहले आपसे पूछे।', action: 'सीमा तय करें' },
      telegram: { label: 'Telegram जोड़ें', note: 'आपका एजेंट वहाँ आपके लिए काम करता है।' },
      deal: { label: 'सौदा शुरू करें', buy: 'मुझे खरीदना है', sell: 'मुझे बेचना है', agreement: 'मेरे पास पहले से खरीदार या विक्रेता है', paymentRequest: 'किसी ग्राहक को भुगतान अनुरोध भेजें' },
      finish: { label: 'इसे पूरा करें। हर सौदा आपका रिकॉर्ड बनाता है।' },
    },
    flowTitle: 'पैसा कैसे चलता है',
    flow: ['आप एस्क्रो में भुगतान करते हैं', 'वे डिलीवर करते हैं', 'आप भुगतान जारी करते हैं', 'दोनों रेटिंग देते हैं'],
  },
  sw: {
    title: 'Biashara yako ya kwanza',
    progress: '{done} kati ya {total}',
    hide: 'Ficha',
    steps: {
      setup: { label: 'Mwambie wakala wako kuhusu kazi yako', action: 'Mwambie wakala' },
      money: { label: 'Ongeza USDC', note: 'Kila makubaliano yanalipwa kwa USDC.', action: 'Ongeza USDC', testnetNote: 'USDC za majaribio bure ili ujaribu makubaliano kamili.', faucet: 'Pata USDC za majaribio bure', fromWallet: 'Ongeza kutoka mkoba mwingine' },
      agentMoney: { label: 'Mpe msaidizi wako pesa', note: 'Msaidizi wako anakutafutia wanunuzi na wauzaji na kukubaliana bei kwa niaba yako. Mpe pesa za kufanyia kazi.', action: 'Mpe pesa' },
      agentLimits: { label: 'Weka mipaka yake', note: 'Bei zako, na kama akuulize kabla ya mpango.', action: 'Weka mipaka' },
      telegram: { label: 'Unganisha Telegram', note: 'Wakala wako anakufanyia kazi huko.' },
      deal: { label: 'Anza makubaliano', buy: 'Nataka kununua', sell: 'Nataka kuuza', agreement: 'Tayari nina mnunuzi au muuzaji', paymentRequest: 'Mtumie mteja ombi la malipo' },
      finish: { label: 'Yakamilishe. Kila makubaliano yanajenga rekodi yako.' },
    },
    flowTitle: 'Jinsi pesa zinavyosonga',
    flow: ['Unalipa kwenye escrow', 'Wanawasilisha', 'Unatoa malipo', 'Wote wanatoa tathmini'],
  },
};
