/// The browser tab title of each page, shown as "<title> · Karwan".
export type RouteTitleKey =
  | 'account'
  | 'activity'
  | 'activityAllTime'
  | 'app'
  | 'b2b'
  | 'brand'
  | 'bridge'
  | 'businessVerification'
  | 'buyer'
  | 'cashout'
  | 'deal'
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
  | 'financingOffer'
  | 'poFinancing'
  | 'howItWorks'
  | 'invite'
  | 'request'
  | 'legacy'
  | 'offers'
  | 'offer'
  | 'market'
  | 'newsletter'
  | 'onboarding'
  | 'trade'
  | 'businesses'
  | 'profile'
  | 'agentFunds'
  | 'business'
  | 'businessSetup'
  | 'contact'
  | 'editProfile'
  | 'openDeals'
  | 'profileSetup'
  | 'wallets'
  | 'cancelRecovery'
  | 'requestMoney'
  | 'research'
  | 'seller'
  | 'send'
  | 'settings'
  | 'stake'
  | 'signIn'
  | 'supply'
  | 'terms'
  | 'chatTerms'
  | 'personCheck'
  | 'waitlist'
  | 'dataApi'
  | 'developers';

export type RouteTitleCopy = Record<RouteTitleKey, string>;

const en: RouteTitleCopy = {
  account: 'Wallet',
  activity: 'Activity',
  activityAllTime: 'All-time activity',
  app: 'Home',
  b2b: 'Karwan for business',
  brand: 'Brand',
  bridge: 'Add or withdraw USDC',
  businessVerification: 'Business verification',
  buyer: 'Buy',
  cashout: 'Cash out',
  deal: 'Deal',
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
  financingOffer: 'Financing offer',
  poFinancing: 'Purchase order financing',
  howItWorks: 'How it works',
  invite: 'Invitation',
  request: 'Request',
  legacy: 'Older positions',
  offers: 'Offers',
  offer: 'Offer',
  market: 'Market',
  newsletter: 'Newsletter',
  onboarding: 'Set up your account',
  trade: 'Trade',
  businesses: 'Businesses',
  profile: 'Profile',
  agentFunds: 'Agent funds',
  business: 'Business',
  businessSetup: 'Business setup',
  contact: 'Contact details',
  editProfile: 'Edit profile',
  openDeals: 'Open deals',
  profileSetup: 'What your agents accept',
  wallets: 'Wallets',
  cancelRecovery: 'Cancel recovery',
  requestMoney: 'Request money',
  research: 'Research',
  seller: 'Sell',
  send: 'Send',
  settings: 'Settings',
  stake: 'Stake',
  signIn: 'Sign in',
  supply: 'Sell to businesses',
  terms: 'Terms',
  chatTerms: 'Chat terms',
  personCheck: 'Person check',
  waitlist: 'Waitlist',
  dataApi: 'Paid data API',
  developers: 'For platforms',
};

const ar: RouteTitleCopy = {
  account: 'المحفظة',
  activity: 'النشاط',
  activityAllTime: 'النشاط منذ البداية',
  app: 'الرئيسية',
  b2b: 'Karwan للأعمال',
  brand: 'الهوية',
  bridge: 'إضافة USDC أو سحبه',
  businessVerification: 'توثيق النشاط التجاري',
  buyer: 'شراء',
  cashout: 'سحب الأرباح',
  deal: 'صفقة',
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
  financingOffer: 'عرض تمويل',
  poFinancing: 'تمويل أمر شراء',
  howItWorks: 'كيف يعمل',
  invite: 'دعوة',
  request: 'طلب',
  legacy: 'مراكز سابقة',
  offers: 'العروض',
  offer: 'عرض',
  market: 'السوق',
  newsletter: 'النشرة',
  onboarding: 'إعداد حسابك',
  trade: 'التداول',
  businesses: 'الشركات',
  profile: 'الملف الشخصي',
  agentFunds: 'أموال الوكلاء',
  business: 'النشاط التجاري',
  businessSetup: 'إعداد النشاط التجاري',
  contact: 'بيانات التواصل',
  editProfile: 'تعديل الملف',
  openDeals: 'الصفقات المفتوحة',
  profileSetup: 'ما يقبله وكلاؤك',
  wallets: 'المحافظ',
  cancelRecovery: 'إلغاء الاسترداد',
  requestMoney: 'طلب مال',
  research: 'بحث',
  seller: 'بيع',
  send: 'إرسال',
  settings: 'الإعدادات',
  stake: 'الرهن',
  signIn: 'تسجيل الدخول',
  supply: 'البيع للشركات',
  terms: 'الشروط',
  chatTerms: 'شروط المحادثة',
  personCheck: 'فحص الشخص',
  waitlist: 'قائمة الانتظار',
  dataApi: 'واجهة البيانات المدفوعة',
  developers: 'للمنصات',
};

const fr: RouteTitleCopy = {
  account: 'Portefeuille',
  activity: 'Activité',
  activityAllTime: 'Activité depuis le début',
  app: 'Accueil',
  b2b: 'Karwan pour les entreprises',
  brand: 'Marque',
  bridge: 'Ajouter ou retirer des USDC',
  businessVerification: 'Vérification de l’entreprise',
  buyer: 'Acheter',
  cashout: 'Encaisser',
  deal: 'Deal',
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
  financingOffer: 'Offre de financement',
  poFinancing: 'Financement de bon de commande',
  howItWorks: 'Comment ça marche',
  invite: 'Invitation',
  request: 'Demande',
  legacy: 'Anciennes positions',
  offers: 'Offres',
  offer: 'Offre',
  market: 'Marché',
  newsletter: 'Lettre d’information',
  onboarding: 'Configurer votre compte',
  trade: 'Échanger',
  businesses: 'Entreprises',
  profile: 'Profil',
  agentFunds: 'Fonds des agents',
  business: 'Entreprise',
  businessSetup: 'Configurer l’entreprise',
  contact: 'Coordonnées',
  editProfile: 'Modifier le profil',
  openDeals: 'Deals ouverts',
  profileSetup: 'Ce que vos agents acceptent',
  wallets: 'Portefeuilles',
  cancelRecovery: 'Annuler la récupération',
  requestMoney: 'Demander de l’argent',
  research: 'Recherche',
  seller: 'Vendre',
  send: 'Envoyer',
  settings: 'Paramètres',
  stake: 'Staking',
  signIn: 'Se connecter',
  supply: 'Vendre aux entreprises',
  terms: 'Conditions',
  chatTerms: 'Conditions du chat',
  personCheck: 'Vérification de personne',
  waitlist: 'Liste d’attente',
  dataApi: 'API de données payante',
  developers: 'Pour les plateformes',
};

const hi: RouteTitleCopy = {
  account: 'वॉलेट',
  activity: 'गतिविधि',
  activityAllTime: 'शुरू से गतिविधि',
  app: 'होम',
  b2b: 'व्यवसायों के लिए Karwan',
  brand: 'ब्रांड',
  bridge: 'USDC जोड़ें या निकालें',
  businessVerification: 'व्यवसाय सत्यापन',
  buyer: 'खरीदें',
  cashout: 'कैश आउट',
  deal: 'डील',
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
  financingOffer: 'फ़ाइनेंसिंग ऑफ़र',
  poFinancing: 'खरीद आदेश फ़ाइनेंसिंग',
  howItWorks: 'यह कैसे काम करता है',
  invite: 'आमंत्रण',
  request: 'अनुरोध',
  legacy: 'पुरानी पोज़ीशन',
  offers: 'ऑफ़र',
  offer: 'ऑफ़र',
  market: 'बाज़ार',
  newsletter: 'न्यूज़लेटर',
  onboarding: 'अपना खाता सेट करें',
  trade: 'व्यापार',
  businesses: 'व्यवसाय',
  profile: 'प्रोफ़ाइल',
  agentFunds: 'एजेंट फ़ंड',
  business: 'व्यवसाय',
  businessSetup: 'व्यवसाय सेटअप',
  contact: 'संपर्क विवरण',
  editProfile: 'प्रोफ़ाइल संपादित करें',
  openDeals: 'खुली डील',
  profileSetup: 'आपके एजेंट क्या स्वीकार करते हैं',
  wallets: 'वॉलेट',
  cancelRecovery: 'रिकवरी रद्द करें',
  requestMoney: 'पैसे का अनुरोध',
  research: 'शोध',
  seller: 'बेचें',
  send: 'भेजें',
  settings: 'सेटिंग्स',
  stake: 'स्टेक',
  signIn: 'साइन इन',
  supply: 'व्यवसायों को बेचें',
  terms: 'शर्तें',
  chatTerms: 'चैट की शर्तें',
  personCheck: 'व्यक्ति जाँच',
  waitlist: 'प्रतीक्षा सूची',
  dataApi: 'सशुल्क डेटा API',
  developers: 'प्लेटफ़ॉर्म के लिए',
};

const sw: RouteTitleCopy = {
  account: 'Pochi',
  activity: 'Shughuli',
  activityAllTime: 'Shughuli tangu mwanzo',
  app: 'Nyumbani',
  b2b: 'Karwan kwa biashara',
  brand: 'Chapa',
  bridge: 'Ongeza au toa USDC',
  businessVerification: 'Uthibitisho wa biashara',
  buyer: 'Nunua',
  cashout: 'Toa mapato',
  deal: 'Mkataba',
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
  financingOffer: 'Ofa ya ufadhili',
  poFinancing: 'Ufadhili wa agizo la ununuzi',
  howItWorks: 'Jinsi inavyofanya kazi',
  invite: 'Mwaliko',
  request: 'Ombi',
  legacy: 'Nafasi za zamani',
  offers: 'Ofa',
  offer: 'Ofa',
  market: 'Soko',
  newsletter: 'Jarida',
  onboarding: 'Andaa akaunti yako',
  trade: 'Biashara',
  businesses: 'Biashara',
  profile: 'Wasifu',
  agentFunds: 'Fedha za mawakala',
  business: 'Biashara',
  businessSetup: 'Kuandaa biashara',
  contact: 'Mawasiliano',
  editProfile: 'Hariri wasifu',
  openDeals: 'Mikataba iliyo wazi',
  profileSetup: 'Wakala wako wanakubali nini',
  wallets: 'Pochi',
  cancelRecovery: 'Ghairi urejeshaji',
  requestMoney: 'Omba pesa',
  research: 'Utafiti',
  seller: 'Uza',
  send: 'Tuma',
  settings: 'Mipangilio',
  stake: 'Weka dhamana',
  signIn: 'Ingia',
  supply: 'Uza kwa biashara',
  terms: 'Masharti',
  chatTerms: 'Masharti ya mazungumzo',
  personCheck: 'Ukaguzi wa mtu',
  waitlist: 'Orodha ya kusubiri',
  dataApi: 'API ya data ya kulipia',
  developers: 'Kwa majukwaa',
};

export const routeTitlesCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', RouteTitleCopy> = { en, ar, fr, hi, sw };
