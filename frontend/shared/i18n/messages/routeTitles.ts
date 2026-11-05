/// The browser tab title of each page, shown as "<title> · Karwan".
export type RouteTitleKey =
  | 'account'
  | 'order'
  | 'assistant'
  | 'connectTelegram'
  | 'activity'
  | 'activityAllTime'
  | 'app'
  | 'b2b'
  | 'brand'
  | 'bridge'
  | 'addMoney'
  | 'withdrawMoney'
  | 'agentMoney'
  | 'businessVerification'
  | 'buyer'
  | 'cashout'
  | 'deal'
  | 'deals'
  | 'paymentRequest'
  | 'docs'
  | 'docsAgents'
  | 'docsBridge'
  | 'docsDeals'
  | 'docsDisputes'
  | 'docsEscrow'
  | 'docsFaq'
  | 'docsNumbers'
  | 'docsReputation'
  | 'docsRoadmap'
  | 'finance'
  | 'ways'
  | 'financingOffer'
  | 'poFinancing'
  | 'howItWorks'
  | 'invite'
  | 'messages'
  | 'request'
  | 'legacy'
  | 'offers'
  | 'offer'
  | 'market'
  | 'newsletter'
  | 'onboarding'
  | 'trade'
  | 'profile'
  | 'agentFunds'
  | 'business'
  | 'businessSetup'
  | 'contact'
  | 'theme'
  | 'editProfile'
  | 'openDeals'
  | 'profileSetup'
  | 'recordSources'
  | 'wallets'
  | 'cancelRecovery'
  | 'requestMoney'
  | 'research'
  | 'seller'
  | 'send'
  | 'setUp'
  | 'settings'
  | 'guarantee'
  | 'contest'
  | 'agentJobs'
  | 'agentJob'
  | 'agentRelease'
  | 'agentPair'
  | 'runContest'
  | 'work'
  | 'hireByHour'
  | 'postHourlyWork'
  | 'signIn'
  | 'signUp'
  | 'terms'
  | 'privacy'
  | 'chatTerms'
  | 'personCheck'
  | 'waitlist'
  | 'dataApi'
  | 'developers';

export type RouteTitleCopy = Record<RouteTitleKey, string>;

const en: RouteTitleCopy = {
  account: 'Wallet',
  connectTelegram: 'Link Telegram',
  activity: 'Activity',
  activityAllTime: 'All-time activity',
  app: 'Home',
  b2b: 'Karwan for business',
  brand: 'Brand',
  bridge: 'Add or withdraw USDC',
  addMoney: 'Add money',
  withdrawMoney: 'Withdraw',
  agentMoney: 'Your agent',
  businessVerification: 'Business verification',
  buyer: 'Buy',
  cashout: 'Cash out',
  deal: 'Deal',
  deals: 'Deals',
  paymentRequest: 'Payment request',
  docs: 'Docs',
  docsAgents: 'Agents',
  docsBridge: 'Moving money',
  docsDeals: 'Deals',
  docsDisputes: 'Disputes',
  docsEscrow: 'Escrow',
  docsFaq: 'Questions',
  docsNumbers: 'Numbers',
  docsReputation: 'Reputation',
  docsRoadmap: 'Roadmap',
  finance: 'Finance',
  ways: 'How you deal',
  recordSources: 'Where your record comes from',
  financingOffer: 'Financing offer',
  poFinancing: 'Purchase order financing',
  howItWorks: 'How it works',
  invite: 'Invitation',
  messages: 'Messages',
  request: 'Request',
  legacy: 'Earlier deals',
  offers: 'Offers',
  offer: 'Offer',
  order: 'Review your order',
  market: 'Market',
  newsletter: 'Newsletter',
  onboarding: 'Set up your account',
  trade: 'Trade',
  profile: 'Profile',
  agentFunds: 'Agent funds',
  business: 'Business',
  businessSetup: 'Business setup',
  contact: 'Contact details',
  theme: 'Theme',
  editProfile: 'Edit profile',
  openDeals: 'Open deals',
  profileSetup: 'Your agent',
  wallets: 'Wallets',
  cancelRecovery: 'Cancel recovery',
  requestMoney: "Request a payment",
  research: 'Research',
  seller: 'Sell',
  send: 'Send',
  setUp: 'Set up my Karwan',
  assistant: 'Assistant',
  settings: 'Settings',
  guarantee: 'Deal guarantee',
  contest: 'Contest',
  agentJobs: 'Deals from outside agents',
  agentJob: 'Deal from an outside agent',
  agentRelease: 'Review the work',
  agentPair: 'Verify for your agent',
  runContest: 'Run a contest',
  work: 'Hourly work',
  hireByHour: 'Hire by the hour',
  postHourlyWork: 'Post hourly work',
  signIn: 'Sign in',
  signUp: 'Sign up',
  terms: 'Terms',
  privacy: 'Privacy notice',
  chatTerms: 'Chat terms',
  personCheck: 'Person check',
  waitlist: 'Waitlist',
  dataApi: 'Paid data API',
  developers: 'For platforms',
};

const ar: RouteTitleCopy = {
  account: 'المحفظة',
  connectTelegram: 'ربط تيليجرام',
  activity: 'النشاط',
  activityAllTime: 'النشاط منذ البداية',
  app: 'الرئيسية',
  b2b: 'Karwan للأعمال',
  brand: 'الهوية',
  bridge: 'إضافة USDC أو سحبه',
  addMoney: 'إضافة مال',
  withdrawMoney: 'سحب',
  agentMoney: 'وكيلك',
  businessVerification: 'توثيق النشاط التجاري',
  buyer: 'شراء',
  cashout: 'سحب الأرباح',
  deal: 'صفقة',
  deals: 'الصفقات',
  paymentRequest: 'طلب دفع',
  docs: 'الوثائق',
  docsAgents: 'الوكلاء',
  docsBridge: 'نقل المال',
  docsDeals: 'الصفقات',
  docsDisputes: 'النزاعات',
  docsEscrow: 'الضمان',
  docsFaq: 'الأسئلة',
  docsNumbers: 'الأرقام',
  docsReputation: 'السمعة',
  docsRoadmap: 'خارطة الطريق',
  finance: 'التمويل',
  ways: 'طريقة تعاملك',
  recordSources: 'من أين يأتي سجلك',
  financingOffer: 'عرض تمويل',
  poFinancing: 'تمويل أمر شراء',
  howItWorks: 'كيف يعمل',
  invite: 'دعوة',
  messages: 'الرسائل',
  request: 'طلب',
  legacy: 'الصفقات السابقة',
  offers: 'العروض',
  offer: 'عرض',
  order: 'راجع طلبك',
  market: 'السوق',
  newsletter: 'النشرة',
  onboarding: 'إعداد حسابك',
  trade: 'التداول',
  profile: 'الملف الشخصي',
  agentFunds: 'أموال الوكلاء',
  business: 'النشاط التجاري',
  businessSetup: 'إعداد النشاط التجاري',
  contact: 'بيانات التواصل',
  theme: 'المظهر',
  editProfile: 'تعديل الملف',
  openDeals: 'الصفقات المفتوحة',
  profileSetup: 'وكيلك',
  wallets: 'المحافظ',
  cancelRecovery: 'إلغاء الاسترداد',
  requestMoney: "طلب دفعة",
  research: 'بحث',
  seller: 'بيع',
  send: 'إرسال',
  setUp: 'إعداد Karwan الخاص بي',
  assistant: 'المساعد',
  settings: 'الإعدادات',
  guarantee: 'ضمان الصفقة',
  contest: 'مسابقة',
  agentJobs: 'صفقات من وكلاء خارجيين',
  agentJob: 'صفقة من وكيل خارجي',
  agentRelease: 'راجع العمل',
  agentPair: 'تحقّق لوكيلك',
  runContest: 'أطلق مسابقة',
  work: 'عمل بالساعة',
  hireByHour: 'التوظيف بالساعة',
  postHourlyWork: 'نشر عمل بالساعة',
  signIn: 'تسجيل الدخول',
  signUp: 'إنشاء حساب',
  terms: 'الشروط',
  privacy: 'إشعار الخصوصية',
  chatTerms: 'شروط المحادثة',
  personCheck: 'فحص الشخص',
  waitlist: 'قائمة الانتظار',
  dataApi: 'واجهة البيانات المدفوعة',
  developers: 'للمنصات',
};

const fr: RouteTitleCopy = {
  account: 'Portefeuille',
  connectTelegram: 'Lier Telegram',
  activity: 'Activité',
  activityAllTime: 'Activité depuis le début',
  app: 'Accueil',
  b2b: 'Karwan pour les entreprises',
  brand: 'Marque',
  bridge: 'Ajouter ou retirer des USDC',
  addMoney: 'Ajouter de l’argent',
  withdrawMoney: 'Retirer',
  agentMoney: 'Votre agent',
  businessVerification: 'Vérification de l’entreprise',
  buyer: 'Acheter',
  cashout: 'Encaisser',
  deal: 'Deal',
  deals: 'Accords',
  paymentRequest: 'Demande de paiement',
  docs: 'Documentation',
  docsAgents: 'Agents',
  docsBridge: 'Déplacer de l’argent',
  docsDeals: 'Deals',
  docsDisputes: 'Litiges',
  docsEscrow: 'Escrow',
  docsFaq: 'Questions',
  docsNumbers: 'Chiffres',
  docsReputation: 'Réputation',
  docsRoadmap: 'Feuille de route',
  finance: 'Financement',
  ways: 'Comment vous traitez',
  recordSources: 'D’où vient votre dossier',
  financingOffer: 'Offre de financement',
  poFinancing: 'Financement de bon de commande',
  howItWorks: 'Comment ça marche',
  invite: 'Invitation',
  messages: 'Messages',
  request: 'Demande',
  legacy: 'Accords précédents',
  offers: 'Offres',
  offer: 'Offre',
  order: 'Vérifiez votre commande',
  market: 'Marché',
  newsletter: 'Lettre d’information',
  onboarding: 'Configurer votre compte',
  trade: 'Échanger',
  profile: 'Profil',
  agentFunds: 'Fonds des agents',
  business: 'Entreprise',
  businessSetup: 'Configurer l’entreprise',
  contact: 'Coordonnées',
  theme: 'Thème',
  editProfile: 'Modifier le profil',
  openDeals: 'Deals ouverts',
  profileSetup: 'Votre agent',
  wallets: 'Portefeuilles',
  cancelRecovery: 'Annuler la récupération',
  requestMoney: "Demander un paiement",
  research: 'Recherche',
  seller: 'Vendre',
  send: 'Envoyer',
  setUp: 'Configurer mon Karwan',
  assistant: 'Assistant',
  settings: 'Paramètres',
  guarantee: 'Garantie de transaction',
  contest: 'Concours',
  agentJobs: 'Accords d’agents extérieurs',
  agentJob: 'Accord d’un agent extérieur',
  agentRelease: 'Vérifier le travail',
  agentPair: 'Vérifier pour votre agent',
  runContest: 'Lancer un concours',
  work: "Travail à l'heure",
  hireByHour: "Embaucher à l'heure",
  postHourlyWork: "Publier un travail à l'heure",
  signIn: 'Se connecter',
  signUp: 'Créer un compte',
  terms: 'Conditions',
  privacy: 'Avis de confidentialité',
  chatTerms: 'Conditions du chat',
  personCheck: 'Vérification de personne',
  waitlist: 'Liste d’attente',
  dataApi: 'API de données payante',
  developers: 'Pour les plateformes',
};

const hi: RouteTitleCopy = {
  account: 'वॉलेट',
  connectTelegram: 'Telegram जोड़ें',
  activity: 'गतिविधि',
  activityAllTime: 'शुरू से गतिविधि',
  app: 'होम',
  b2b: 'व्यवसायों के लिए Karwan',
  brand: 'ब्रांड',
  bridge: 'USDC जोड़ें या निकालें',
  addMoney: 'पैसा जोड़ें',
  withdrawMoney: 'निकालें',
  agentMoney: 'आपका एजेंट',
  businessVerification: 'व्यवसाय सत्यापन',
  buyer: 'खरीदें',
  cashout: 'कैश आउट',
  deal: 'डील',
  deals: 'सौदे',
  paymentRequest: 'भुगतान अनुरोध',
  docs: 'दस्तावेज़',
  docsAgents: 'एजेंट',
  docsBridge: 'पैसा भेजना',
  docsDeals: 'डील',
  docsDisputes: 'विवाद',
  docsEscrow: 'एस्क्रो',
  docsFaq: 'सवाल',
  docsNumbers: 'आँकड़े',
  docsReputation: 'प्रतिष्ठा',
  docsRoadmap: 'रोडमैप',
  finance: 'वित्त',
  ways: 'आप कैसे सौदा करते हैं',
  recordSources: 'आपका रिकॉर्ड कहां से आता है',
  financingOffer: 'फ़ाइनेंसिंग ऑफ़र',
  poFinancing: 'खरीद आदेश फ़ाइनेंसिंग',
  howItWorks: 'यह कैसे काम करता है',
  invite: 'आमंत्रण',
  messages: 'संदेश',
  request: 'अनुरोध',
  legacy: 'पिछले सौदे',
  offers: 'ऑफ़र',
  offer: 'ऑफ़र',
  order: 'अपना ऑर्डर देखें',
  market: 'बाज़ार',
  newsletter: 'न्यूज़लेटर',
  onboarding: 'अपना खाता सेट करें',
  trade: 'व्यापार',
  profile: 'प्रोफ़ाइल',
  agentFunds: 'एजेंट फ़ंड',
  business: 'व्यवसाय',
  businessSetup: 'व्यवसाय सेटअप',
  contact: 'संपर्क विवरण',
  theme: 'थीम',
  editProfile: 'प्रोफ़ाइल संपादित करें',
  openDeals: 'खुली डील',
  profileSetup: 'आपका एजेंट',
  wallets: 'वॉलेट',
  cancelRecovery: 'रिकवरी रद्द करें',
  requestMoney: "भुगतान माँगें",
  research: 'शोध',
  seller: 'बेचें',
  send: 'भेजें',
  setUp: 'मेरा Karwan सेट करें',
  assistant: 'सहायक',
  settings: 'सेटिंग्स',
  guarantee: 'डील गारंटी',
  contest: 'प्रतियोगिता',
  agentJobs: 'बाहरी एजेंटों से सौदे',
  agentJob: 'बाहरी एजेंट से सौदा',
  agentRelease: 'काम की समीक्षा करें',
  agentPair: 'अपने एजेंट के लिए सत्यापित करें',
  runContest: 'प्रतियोगिता चलाएँ',
  work: 'घंटे के हिसाब से काम',
  hireByHour: 'घंटे के हिसाब से काम पर रखें',
  postHourlyWork: 'घंटे के हिसाब से काम पोस्ट करें',
  signIn: 'साइन इन',
  signUp: 'साइन अप',
  terms: 'शर्तें',
  privacy: 'गोपनीयता सूचना',
  chatTerms: 'चैट की शर्तें',
  personCheck: 'व्यक्ति जाँच',
  waitlist: 'प्रतीक्षा सूची',
  dataApi: 'सशुल्क डेटा API',
  developers: 'प्लेटफ़ॉर्म के लिए',
};

const sw: RouteTitleCopy = {
  account: 'Pochi',
  connectTelegram: 'Unganisha Telegram',
  activity: 'Shughuli',
  activityAllTime: 'Shughuli tangu mwanzo',
  app: 'Nyumbani',
  b2b: 'Karwan kwa biashara',
  brand: 'Chapa',
  bridge: 'Ongeza au toa USDC',
  addMoney: 'Ongeza pesa',
  withdrawMoney: 'Toa',
  agentMoney: 'Wakala wako',
  businessVerification: 'Uthibitisho wa biashara',
  buyer: 'Nunua',
  cashout: 'Toa mapato',
  deal: 'Mkataba',
  deals: 'Mikataba',
  paymentRequest: 'Ombi la malipo',
  docs: 'Nyaraka',
  docsAgents: 'Mawakala',
  docsBridge: 'Kuhamisha pesa',
  docsDeals: 'Mikataba',
  docsDisputes: 'Migogoro',
  docsEscrow: 'Escrow',
  docsFaq: 'Maswali',
  docsNumbers: 'Takwimu',
  docsReputation: 'Sifa',
  docsRoadmap: 'Ramani ya njia',
  finance: 'Ufadhili',
  ways: 'Jinsi unavyofanya biashara',
  recordSources: 'Rekodi yako inatoka wapi',
  financingOffer: 'Ofa ya ufadhili',
  poFinancing: 'Ufadhili wa agizo la ununuzi',
  howItWorks: 'Jinsi inavyofanya kazi',
  invite: 'Mwaliko',
  messages: 'Ujumbe',
  request: 'Ombi',
  legacy: 'Mikataba ya awali',
  offers: 'Ofa',
  offer: 'Ofa',
  order: 'Kagua oda yako',
  market: 'Soko',
  newsletter: 'Jarida',
  onboarding: 'Andaa akaunti yako',
  trade: 'Biashara',
  profile: 'Wasifu',
  agentFunds: 'Fedha za mawakala',
  business: 'Biashara',
  businessSetup: 'Kuandaa biashara',
  contact: 'Mawasiliano',
  theme: 'Mwonekano',
  editProfile: 'Hariri wasifu',
  openDeals: 'Mikataba iliyo wazi',
  profileSetup: 'Wakala wako',
  wallets: 'Pochi',
  cancelRecovery: 'Ghairi urejeshaji',
  requestMoney: "Omba malipo",
  research: 'Utafiti',
  seller: 'Uza',
  send: 'Tuma',
  setUp: 'Weka Karwan yangu',
  assistant: 'Msaidizi',
  settings: 'Mipangilio',
  guarantee: 'Dhamana ya mpango',
  contest: 'Shindano',
  agentJobs: 'Mipango ya mawakala wa nje',
  agentJob: 'Mpango wa wakala wa nje',
  agentRelease: 'Kagua kazi',
  agentPair: 'Thibitisha kwa wakala wako',
  runContest: 'Endesha shindano',
  work: 'Kazi ya saa',
  hireByHour: 'Ajiri kwa saa',
  postHourlyWork: 'Chapisha kazi ya saa',
  signIn: 'Ingia',
  signUp: 'Jisajili',
  terms: 'Masharti',
  privacy: 'Taarifa ya faragha',
  chatTerms: 'Masharti ya mazungumzo',
  personCheck: 'Ukaguzi wa mtu',
  waitlist: 'Orodha ya kusubiri',
  dataApi: 'API ya data ya kulipia',
  developers: 'Kwa majukwaa',
};

export const routeTitlesCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', RouteTitleCopy> = { en, ar, fr, hi, sw };
